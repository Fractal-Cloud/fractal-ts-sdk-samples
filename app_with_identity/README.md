# app_with_identity

A governed web application: a workload runs on a managed **ContainerPlatform**,
authenticates against an **IdentityProvider**, and owns a **RelationalDatabase** —
all wired by governed Fractal operations. The blueprint (`fractal.ts`) is
cloud-agnostic; each entrypoint selects concrete offers per component and may mix
vendors within one LiveSystem.

## What it provisions

```
ContainerPlatform (app-platform)          — managed Kubernetes (guardrails: k8s version, network policy)
RelationalDbms    (app-dbms)              — managed relational engine (guardrails: HA, backups, version)
IdentityProvider  (idp)                   — OAuth pool/tenant (guardrails: MFA, password policy)

withStatefulService('orders') adds, in one governed verb:
  Workload            (orders)            — child of app-platform (your app image + resource/health guardrails)
  RelationalDatabase  (orders-db)         — child of app-dbms
  link orders → orders-db  {access: read-write}   — DB role + connection env injected at reconcile
  link orders → idp        {clientType: web}      — provisions ONE web OAuth client
```

The `orders` **Workload** is a portable `CustomWorkloads.CaaS.KubernetesWorkload`,
emitted by the platform offer and deployed onto the cluster by the CaaS/Kubernetes
agent — **not** by the cloud (AWS/Azure/GCP) agent.

## Project layout

```
src/
  fractal.ts   # Cloud-agnostic blueprint + operations (withUserDirectory, withStatefulService)
  aws.ts       # AWS EKS + AWS Cognito + Amazon RDS (all-AWS)
  mixed.ts     # AWS EKS + AWS Cognito + Azure Postgres (one mixed-vendor LiveSystem)
  azure.ts     # Azure AKS + Entra + Azure Postgres
```

## Container image

The entrypoints ship `image: 'public.ecr.aws/nginx/nginx:latest'`, a
fully-qualified public image, so the sample deploys end-to-end on any cluster
with no registry push and no pull secret. It is a **stand-in for YOUR
application image**: the platform does not build or supply one. To run your own
app, change the `image` passed to `withStatefulService` in the entrypoint.

### How the image reference is resolved

The CaaS/Kubernetes agent treats the `image` value two ways:

| Reference form | Example | Behaviour |
|---|---|---|
| **Bare** (no registry host) | `acme/web:1.4.0` | **Auto-prefixed** with your cluster's provider registry host (ECR on AWS, ACR on Azure, GAR on GCP) → becomes `<your-registry>/acme/web:1.4.0`. **You must have pushed the image there.** |
| **Fully-qualified** (has a host) | `public.ecr.aws/nginx/nginx:latest`, `myrepo.io/app:1.4.0` | Pulled **exactly as written** — no prefix. Use this for public images or an external registry. |

So a bare tag keeps the blueprint cloud-agnostic (the same `acme/web:1.4.0`
resolves to ECR/ACR/GAR depending on where you deploy) — but it only works if the
image is present in that provider's registry.

### Option A — push your image to the cluster's provider registry (bare tag)

Use a bare tag such as `image: 'acme/web:1.4.0'`, and push the image to the
registry the agent will prefix it with. Until it is there, the workload sits in
`ImagePullBackOff`. AWS/EKS example (adjust account/region; use `az acr` / `gcloud artifacts` for
Azure/GCP):

```bash
REGISTRY=<account>.dkr.ecr.<region>.amazonaws.com
aws ecr create-repository --repository-name acme/web            # once
aws ecr get-login-password | docker login -u AWS --password-stdin "$REGISTRY"

# build + push your real app:
docker buildx build -t "$REGISTRY/acme/web:1.4.0" --push .

# — or, just to see the sample run, copy a public placeholder in:
#   regctl image copy public.ecr.aws/nginx/nginx:latest "$REGISTRY/acme/web:1.4.0"
```

**Pull access** (no `imagePullSecrets` needed in these cases):
- **EKS** — node role has `AmazonEC2ContainerRegistryReadOnly` → pulls same-account ECR.
- **AKS** — attach the ACR to the cluster (`az aks update --attach-acr`) → kubelet managed identity pulls it.
- **GKE** — the node service account has `roles/artifactregistry.reader` on same-project GAR.

Otherwise (cross-account / private third-party registry), supply a pull secret via
the workload's `imagePullSecrets`.

### Option B — a fully-qualified image (what the sample ships)

Pass an image with a registry host, for example a public no-auth image
(the default) or your own external registry:

```ts
.withStatefulService({ name: 'orders', image: 'myrepo.io/app:1.4.0', ... })
```

A public image pulls on any cluster with no registry setup and no pull secret.
A private external registry needs the workload's `imagePullSecrets`.

### Image expectations

- Serves on the workload's container port (default `80`).
- The Fractal declares a health check (`/healthz:8080`) as an architect guardrail;
  a production image should honour it.
- Multi-arch is safest (cluster nodes may be arm64 or amd64).

## Quick start

```bash
cp .sample.env .env   # then fill in the blanks
./deploy.sh           # builds and deploys the default target (azure)
./deploy.sh mixed     # ...or any other target
```

`deploy.sh` loads `.env` (variables already exported in the shell win, so CI can
inject secrets without a file), then runs `npm install`, `npm run compile` and
`node build/src/<target>.js`, propagating its exit code. `.sample.env` lists every
variable this sample reads, with the required ones left blank. Targets: `aws` `azure` `mixed`.

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | Target environment name (default: `dev`) |
| `BC_NAME` | no | Bounded-context name |
| `DEPLOY_MODE` | no | `wait` (default) or `fire-and-forget` |

## Running

```bash
npm install
npm run compile

export SERVICE_ACCOUNT_ID=<id>
export SERVICE_ACCOUNT_SECRET=<secret>
export OWNER_ID=<uuid>
export ENVIRONMENT_NAME=dev

node build/src/aws.js       # AWS EKS + Cognito + Amazon RDS (all-AWS)
node build/src/mixed.js     # AWS EKS + Cognito + Azure Postgres
node build/src/azure.js     # Azure AKS + Entra + Azure Postgres
```

In `wait` mode the sample blocks until the LiveSystem is Active (or exits
non-zero on failure). If you swap in your own image, the workload only reaches
Active once that image is pullable (see above).

## Lint and type-check

```bash
npm run lint
npm run fix
```
