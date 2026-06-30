# basic_container_platform

Demonstrates a cloud-agnostic two-tier container workload using the Fractal Cloud TypeScript SDK. The same blueprint deploys on **AWS (ECS), Azure (Container Apps), or GCP (Cloud Run)** — pick the target provider at runtime with a single environment variable. The vendor is named only when offers are selected.

## What it provisions

```
VirtualNetwork (main-network, 10.0.0.0/16)
└── Subnet (private-subnet, 10.0.1.0/24)
SecurityGroup (app-sg)
    ├── ingress: TCP 80   from 0.0.0.0/0   (public HTTP)
    └── ingress: TCP 8080 from 10.0.0.0/16 (internal only)
ContainerPlatform (app-cluster)   — node pool "system", autoscaling 1–3
    ├── web-workload  (deps: cluster + subnet)  — member of app-sg, links to api on TCP 8080
    └── api-workload  (deps: cluster + subnet)  — member of app-sg
```

All structure — CIDR/ingress guardrails, node-pool topology, dependencies, and
the `web-workload → api-workload` traffic-rule link on port 8080 — is declared
once in `fractal.ts`. The container images and replica counts are **application
choices**, set through the Fractal's operations in `index.ts` (here: web =
`nginx:alpine` ×2, api = `registry.redhat.io/ubi9/httpd-24:latest` ×2).

## Project layout

```
src/
  fractal.ts   # Cloud-agnostic blueprint — ALL structure + guardrails, plus the
               #   typed operations interface (withWebImage / withWebReplicas /
               #   withApiImage / withApiReplicas). Abstract Components only.
  index.ts     # Entry point. Specializes the Fractal (sets images + replicas via
               #   operations), then builds the LiveSystem by per-component OFFER
               #   SELECTION (the `select` map). CLOUD_PROVIDER picks the offer
               #   set, then deploy() runs in wait mode.
```

### Who owns what

| Concern | Lives in |
|---------|----------|
| CIDR blocks, ingress rules, node pools / autoscaling | `fractal.ts` — guardrails (locked `.withXxx()`) |
| Dependencies + workload/security-group/traffic links | `fractal.ts` — blueprint structure (`.dependsOn` / `bp.link`) |
| Container image + replica count per tier | `index.ts` — operations (`withWebImage`, `withWebReplicas`, …) |
| Which vendor satisfies each component, vendor knobs | `index.ts` — the `select` map (offer + offer config) |

`index.ts` is the only place a vendor is named. It maps each blueprint component
id to a concrete Offer; the compiler enforces that each offer satisfies its
slot's Component. To retarget a component, swap one line in the `select` map.

## Selecting a provider

Set `CLOUD_PROVIDER` to one of: `aws` (default) · `azure` · `gcp`

```bash
CLOUD_PROVIDER=azure node build/src/index.js
```

Per provider, the workload offer is ECS (`EcsService`, Fargate) on AWS,
`AzureContainerApp` on Azure, and `CloudRun` on GCP; the cluster is `Eks` / `Aks`
/ `Gke`. Offer config (launch type, region, resource group) is set as literals in
each branch of `selectionFor()` in `index.ts`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | Target environment name (default: `dev`) |
| `BC_NAME` | no | Bounded-context name (default: `wizard`) |
| `CLOUD_PROVIDER` | no | `aws` (default) · `azure` · `gcp` |

## Running

```bash
npm install
npm run compile
```

Export the required variables, then run:

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

The sample deploys in `wait` mode — it blocks until the live system is Active
(or exits non-zero on failure).

## Lint and type-check

```bash
npm run lint   # check
npm run fix    # auto-format
```
</content>
