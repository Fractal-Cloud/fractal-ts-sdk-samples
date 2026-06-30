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
choices**, set through the Fractal's operations in each per-cloud entrypoint
(here: web = `nginx:alpine` ×2, api = `registry.redhat.io/ubi9/httpd-24:latest` ×2).

## Project layout

```
src/
  fractal.ts   # Cloud-agnostic blueprint — ALL structure + guardrails, plus the
               #   typed operations interface (withWebImage / withWebReplicas /
               #   withApiImage / withApiReplicas). Abstract Components only.
  aws.ts       # Self-contained AWS entrypoint — copy and run
  azure.ts     # Self-contained Azure entrypoint — copy and run
  gcp.ts       # Self-contained GCP entrypoint — copy and run
```

Each `src/<cloud>.ts` is a self-contained, runnable entrypoint. It specializes
the Fractal (sets images + replicas via operations), then builds the LiveSystem
by per-component OFFER SELECTION (the inline `select` map) and runs deploy() in
wait mode. Pick a cloud by copying and running its file — there is no provider
dispatch. The `select` map is the only cloud-specific code.

### Who owns what

| Concern | Lives in |
|---------|----------|
| CIDR blocks, ingress rules, node pools / autoscaling | `fractal.ts` — guardrails (locked `.withXxx()`) |
| Dependencies + workload/security-group/traffic links | `fractal.ts` — blueprint structure (`.dependsOn` / `bp.link`) |
| Container image + replica count per tier | per-cloud entrypoint — operations (`withWebImage`, `withWebReplicas`, …) |
| Which vendor satisfies each component, vendor knobs | per-cloud entrypoint — the `select` map (offer + offer config) |

The per-cloud entrypoint is the only place a vendor is named. It maps each
blueprint component id to a concrete Offer; the compiler enforces that each offer
satisfies its slot's Component. To retarget a component, swap one line in the
`select` map.

## Selecting a provider

Pick a provider by running its entrypoint: `aws.js` · `azure.js` · `gcp.js`

```bash
node build/src/azure.js
```

Per provider, the workload offer is ECS (`EcsService`, Fargate) on AWS,
`AzureContainerApp` on Azure, and `CloudRun` on GCP; the cluster is `Eks` / `Aks`
/ `Gke`. Offer config (launch type, region, resource group) is set as literals in
the `select` map of each per-cloud entrypoint.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | Target environment name (default: `dev`) |
| `BC_NAME` | no | Bounded-context name (default: `wizard`) |

Pick a provider by running its entrypoint (`aws.js` · `azure.js` · `gcp.js`) — there is no provider-selection environment variable.

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

node build/src/aws.js      # deploy on AWS (ECS)
node build/src/azure.js    # deploy on Azure (Container Apps)
node build/src/gcp.js      # deploy on GCP (Cloud Run)
```

The sample deploys in `wait` mode — it blocks until the live system is Active
(or exits non-zero on failure).

## Lint and type-check

```bash
npm run lint   # check
npm run fix    # auto-format
```
</content>
