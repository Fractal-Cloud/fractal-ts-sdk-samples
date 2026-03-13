# basic_container_platform

Demonstrates a cloud-agnostic two-tier container workload using the Fractal Cloud TypeScript SDK. The same blueprint deploys on **AWS (ECS Fargate), Azure (Container Apps), or GCP (Cloud Run)** — select the target provider at runtime with a single environment variable.

## What it provisions

```
VirtualNetwork (10.2.0.0/16)
+-- Subnet (10.2.1.0/24, private)
|   +-- web-workload  nginx:alpine       port 80   256 CPU / 512 MB   2 replicas
|   +-- api-workload  amazonlinux:latest  port 8080  512 CPU / 1024 MB  2 replicas
+-- SecurityGroup
    +-- ingress: TCP 80 from 0.0.0.0/0 (public HTTP)
    +-- ingress: TCP 8080 from 10.2.0.0/16 (internal VPC only)

ContainerPlatform (app-cluster)
+-- web-workload (deps: cluster + subnet)
+-- api-workload (deps: cluster + subnet)
```

**Network rules** are declared in the blueprint:
- `web-workload -> api-workload` on port 8080 — the agent creates managed SG egress/ingress rules automatically
- Both workloads are members of `app-sg` via explicit security group links

## Project layout

```
src/
  fractal.ts              # Cloud-agnostic blueprint: cluster, workloads, network
  aws_live_system.ts      # AWS:   ECS Cluster + Task Definitions + Services
  azure_live_system.ts    # Azure: Container Apps Environment + Container Apps
  gcp_live_system.ts      # GCP:   GKE Cluster + Cloud Run Services
  index.ts                # Entry point — provider selected by CLOUD_PROVIDER
```

### Blueprint / Live System split

| Concern | Declared in |
|---------|-------------|
| Container image, CPU, memory | `fractal.ts` — `Workload.create()` |
| Desired replica count | `fractal.ts` — `Workload.create({ desiredCount })` |
| Workload-to-workload traffic rules | `fractal.ts` — `.linkToWorkload()` |
| Security group membership | `fractal.ts` — `.linkToSecurityGroup()` |
| Ingress rules | `fractal.ts` — `SecurityGroup.create({ ingressRules })` |
| AWS: Fargate launch type, IAM roles | `aws_live_system.ts` |
| Azure: region, resource group, ingress mode | `azure_live_system.ts` |
| GCP: region, ingress mode | `gcp_live_system.ts` |

## Selecting a provider

Set `CLOUD_PROVIDER` to one of: `aws` (default) · `azure` · `gcp`

```bash
CLOUD_PROVIDER=azure node build/src/index.js
```

Only the selected provider's environment variables need to be set.

## Environment variables

### Common (all providers)

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | yes | kebab-case target environment name, e.g. `dev` |

### AWS (`CLOUD_PROVIDER=aws`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ECS_EXECUTION_ROLE_ARN` | no | _(empty)_ | IAM execution role ARN for ECS tasks |
| `ECS_TASK_ROLE_ARN` | no | _(empty)_ | IAM task role ARN for the API workload |

### Azure (`CLOUD_PROVIDER=azure`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AZURE_LOCATION` | no | `westeurope` | Azure region |
| `AZURE_RESOURCE_GROUP` | no | `my-resource-group` | Azure resource group name |

### GCP (`CLOUD_PROVIDER=gcp`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GCP_REGION` | no | `europe-west1` | GCP region |

## Running

```bash
npm install
npm run compile
```

Export the required environment variables, then run:

```bash
export SERVICE_ACCOUNT_ID=<id>
export SERVICE_ACCOUNT_SECRET=<secret>
export OWNER_ID=<uuid>
export ENVIRONMENT_NAME=dev

# AWS (default)
node build/src/index.js

# Azure
CLOUD_PROVIDER=azure node build/src/index.js

# GCP
CLOUD_PROVIDER=gcp node build/src/index.js
```

## Lint and type-check

```bash
npm run lint   # check
npm run fix    # auto-format
```
