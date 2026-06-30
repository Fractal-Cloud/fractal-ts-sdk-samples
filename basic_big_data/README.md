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
  index.ts     # Offer-selection entry point — CLOUD_PROVIDER dispatch (aws | azure | gcp)
```

### Blueprint / offer-config split

| Concern | Declared in |
|---------|-------------|
| Cluster max workers, auto-termination timeout | `fractal.ts` — guardrail |
| ETL job retry policy | `fractal.ts` — guardrail |
| Datalake object versioning | `fractal.ts` — guardrail |
| Cluster → job dependency | `fractal.ts` — structural |
| Cluster name, job schedule, experiment display name | `fractal.ts` — operations (app-level, not locked) |
| Vendor-specific offer config (bucket name, resource group, etc.) | `index.ts` — offer config |

## Selecting a provider

Set `CLOUD_PROVIDER` to one of: `aws` (default) · `azure` · `gcp`

```bash
CLOUD_PROVIDER=azure node build/src/index.js
```

`index.ts` reads `CLOUD_PROVIDER`, calls `selectionFor(provider)`, and maps each component ID to a concrete vendor offer. The Fractal is never touched when the provider changes.

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

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOUD_PROVIDER` | no | `aws` | Target provider: `aws`, `azure`, or `gcp` |

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

# AWS (default)
node build/src/index.js

# Azure
CLOUD_PROVIDER=azure node build/src/index.js

# GCP
CLOUD_PROVIDER=gcp node build/src/index.js
```

The deploy runs in `wait` mode: structured log lines (`INFO` / `CHECK` / `ERROR`) stream to stdout until the Live System reaches Active or fails.
