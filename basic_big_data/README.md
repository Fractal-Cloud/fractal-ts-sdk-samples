# basic_big_data

Demonstrates a cloud-agnostic BigData workload using the Fractal Cloud TypeScript SDK. The same blueprint deploys on **AWS, Azure, or GCP** — all using Databricks. Select the target provider at runtime with a single environment variable.

## What it provisions

```
ComputeCluster (analytics-cluster)  — Databricks cluster (max 10 workers, 30-min auto-termination)
DataProcessingJob (etl-job)         — Scheduled ETL job (depends on cluster)
MlExperiment (fraud-model)          — MLflow experiment tracker
Datalake (lake)                     — Versioned object storage (versioning enabled)
```

## Project layout

```
src/
  fractal.ts   # Cloud-agnostic blueprint: cluster, job, MLflow, datalake; guardrails locked
  aws.ts       # Self-contained AWS entrypoint — copy and run
  azure.ts     # Self-contained Azure entrypoint — copy and run
  gcp.ts       # Self-contained GCP entrypoint — copy and run
```

Each `src/<cloud>.ts` is a self-contained, runnable entrypoint: it specializes
the Fractal, builds the LiveSystem, and deploys. Pick a cloud by copying and
running its file — there is no provider dispatch. The inline `select` map is the
only cloud-specific code; the blueprint in `fractal.ts` is identical across all.

### Blueprint / offer-config split

| Concern | Declared in |
|---------|-------------|
| Cluster max workers, auto-termination timeout | `fractal.ts` — guardrail |
| ETL job retry policy | `fractal.ts` — guardrail |
| Datalake object versioning | `fractal.ts` — guardrail |
| Cluster → job dependency | `fractal.ts` — structural |
| Cluster name, job schedule, experiment display name | `fractal.ts` — operations (app-level, not locked) |
| Vendor-specific offer config (bucket name, resource group, etc.) | per-cloud entrypoint — offer config |

## Selecting a provider

Pick a provider by running its entrypoint: `aws.js` · `azure.js` · `gcp.js`

```bash
node build/src/azure.js
```

Each per-cloud entrypoint maps every component ID to a concrete vendor offer in its inline `select` map. The Fractal is never touched when the provider changes.

## Environment variables

### Common (all providers)

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | Kebab-case environment name (default: `dev`) |
| `BC_NAME` | no | Bounded-context name (default: `wizard`) |

### Provider selection

Pick a provider by running its entrypoint (`aws.js` · `azure.js` · `gcp.js`) — there is no provider-selection environment variable.

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

node build/src/aws.js      # deploy on AWS
node build/src/azure.js    # deploy on Azure
node build/src/gcp.js      # deploy on GCP
```

The deploy runs in `wait` mode: structured log lines (`INFO` / `CHECK` / `ERROR`) stream to stdout until the Live System reaches Active or fails.
