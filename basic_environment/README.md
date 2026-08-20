# basic_environment

Initialize a Fractal Cloud **Environment** with the SDK, then deploy a
**LiveSystem** into it. This is the only sample that exercises the environment
surface (`deployEnvironment`); the others deploy LiveSystems into an environment
that already exists.

## What it shows

- A **management environment** that owns a **cloud agent** (Azure, full identity:
  tenant + subscription) and one **operational environment** (`prod`).
- The operational env declares a cloud **account** (a subscription) plus a
  default **CI/CD profile** and a **secret** — the operational env's tenant is
  inherited from the management agent automatically.
- `deployEnvironment(...)` create/updates both envs, pushes the secret + CI/CD
  profile, and initializes the cloud agent (`agentInit: 'wait'` blocks until
  each initialization completes).
- Deploying a LiveSystem **into the operational env** with a typo-proof binding:
  `management.operational('prod').ref()`. To target the management env instead,
  use `management.ref()`.

## Layout

```
src/
  fractal.ts   # a minimal governed Fractal (one uploads bucket) — the sample payload
  azure.ts     # init the environment tree, then deploy the LiveSystem into 'prod'
```

## Run

```bash
npm install
npm run compile
node build/src/azure.js
```

## Quick start

```bash
cp .sample.env .env   # then fill in the blanks
./deploy.sh           # builds and deploys the default target (azure)
```

`deploy.sh` loads `.env` (variables already exported in the shell win, so CI can
inject secrets without a file), then runs `npm install`, `npm run compile` and
`node build/src/<target>.js`, propagating its exit code. `.sample.env` lists every
variable this sample reads, with the required ones left blank. This sample has a single target, `azure`.

## Azure prerequisites

This sample is different from the others: it does not deploy into an environment
that already exists, it **creates two environments and initializes a real cloud
agent in each**. That has consequences you must satisfy before it can run.

### 1. Two DIFFERENT subscriptions, both unclaimed

`mgmt` declares the management cloud agent; `prod` declares an operational cloud
account, which the SDK resolves into a full agent of its own. `deploy()` then
calls `initialize` for **each** of them, so two subscriptions get claimed.

- They must be **two distinct subscriptions**. Pointing both variables at one
  fails: an operational environment initializing on its management environment's
  subscription counts as reuse.
- Neither may already be claimed by another Active Fractal environment. A
  subscription is claimed by the first environment that initializes on it, and
  released when that environment is deleted.
- Both must be in the tenant named by `AZURE_TENANT_ID` — the claim is keyed on
  `(tenant, subscription)`.

Get this wrong and the run fails with **HTTP 400 / `AzureSubscriptionInUse`**,
naming the environment that already holds the claim.

### 2. A service principal with provisioning rights on both

Initialization creates resource groups, networking, identities and role
assignments, so the principal you authenticate as needs, **at subscription scope
on both subscriptions**:

- **Contributor**
- **Role Based Access Control Administrator**

Use a principal dedicated to this sample rather than a general-purpose CI
identity — this is the only sample needing rights this broad, and scoping them to
two throwaway subscriptions keeps them out of everything else.

```bash
APP_ID=$(az ad app create --display-name my-basic-environment-sample --query appId -o tsv)
az ad sp create --id "$APP_ID"
for sub in "$MGMT_SUB" "$OPER_SUB"; do
  az role assignment create --assignee "$APP_ID" --role "Contributor" \
    --scope "/subscriptions/$sub"
  az role assignment create --assignee "$APP_ID" \
    --role "Role Based Access Control Administrator" \
    --scope "/subscriptions/$sub"
done
```

If the roles are missing, the subscription claim still succeeds and the run fails
**later**, inside authentication or the first ARM call — which reads like a
credential problem rather than a missing grant. Check role assignments first.

### 3. Pick an auth mode

`AZURE_CLOUD_AGENT_AUTH` selects how the sample proves that identity:

| Mode | What it needs | Notes |
|---|---|---|
| `sp` (default) | `AZURE_SP_CLIENT_ID` + `AZURE_SP_CLIENT_SECRET` | Simplest locally; a long-lived secret exists. |
| `oidc` | `AZURE_SP_CLIENT_ID` + a federated credential on the app | No secret. The app must trust the exact token subject your CI mints, e.g. `repo:<org>/<repo>:ref:refs/heads/main`. |

In `oidc` mode the sample mints a short-lived token and sends it with the client
id, so nothing secret leaves the runner. If the federated credential's subject
does not match the token your CI issues, Azure AD rejects the exchange and the
client id looks wrong when it is not.

## Environment variables

Control plane + Fractal identity:

| Var | Purpose |
|---|---|
| `SERVICE_ACCOUNT_ID` / `SERVICE_ACCOUNT_SECRET` | Fractal Cloud control-plane credentials |
| `OWNER_ID` | Owner (Bounded Context / Environment) UUID |
| `BC_NAME` | Bounded Context short name (default `reusable-templates`) |

Azure cloud-agent identity + provider credentials:

| Var | Purpose |
|---|---|
| `AZURE_TENANT_ID` | Azure tenant (management agent identity) |
| `AZURE_MANAGEMENT_SUBSCRIPTION_ID` | Subscription for the management cloud agent |
| `AZURE_OPERATIONAL_SUBSCRIPTION_ID` | Subscription for the `prod` operational env |
| `AZURE_SP_CLIENT_ID` / `AZURE_SP_CLIENT_SECRET` | Service-principal credentials for agent initialization (sent as `X-Azure-SP-*` headers) |

Optional payload (CI/CD profile + secret):

| Var | Purpose |
|---|---|
| `SSH_PRIVATE_KEY` / `SSH_PASSPHRASE` | Default CI/CD deploy key |
| `DB_PASSWORD` | Example environment secret |

## Adapting to another cloud

Swap the management cloud agent (`.withAwsCloudAgent`, `.withGcpCloudAgent`,
`.withOciCloudAgent`, `.withHetznerCloudAgent`) and the operational cloud account
(`.withAwsAccount`, `.withGcpProject`, `.withOciCompartment`,
`.withHetznerProject`), then pass that provider's credentials in
`providerCredentials`. The LiveSystem `select` offer changes with the cloud as in
the other samples.
