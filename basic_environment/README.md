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
