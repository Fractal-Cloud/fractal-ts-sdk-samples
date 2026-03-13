# basic_big_data

Demonstrates a cloud-agnostic BigData workload using the Fractal Cloud TypeScript SDK. The same blueprint deploys on **AWS, Azure, or GCP** — all using Databricks. Select the target provider at runtime with a single environment variable.

## What it provisions

```
DistributedDataProcessing (analytics-platform) — Databricks workspace
+-- ComputeCluster (spark-cluster)    — Spark 14.3.x, platform dep auto-wired
+-- DataProcessingJob (etl-job)       — notebook task, platform dep auto-wired
+-- MlExperiment (training-exp)       — MLflow experiment, platform dep auto-wired
```

All child component dependencies on the platform are auto-wired by the blueprint via `withClusters()`, `withJobs()`, and `withExperiments()`.

## Project layout

```
src/
  fractal.ts            # Cloud-agnostic blueprint: workspace, cluster, job, MLflow
  aws_live_system.ts    # AWS:   Databricks on AWS (credentials, storage config)
  azure_live_system.ts  # Azure: Databricks on Azure (managed resource group)
  gcp_live_system.ts    # GCP:   Databricks on GCP (network ID)
  index.ts              # Entry point — provider selected by CLOUD_PROVIDER
```

### Blueprint / Live System split

| Concern | Declared in |
|---------|-------------|
| Cluster name, Spark version, job name, task type, notebook path, experiment name | `fractal.ts` — blueprint params |
| Platform → child dependencies | `fractal.ts` — auto-wired |
| Pricing tier, node type ID, artifact location | `*_live_system.ts` — vendor-specific |
| AWS credentials ID, storage configuration ID | `aws_live_system.ts` |
| Azure managed resource group, no-public-IP flag | `azure_live_system.ts` |
| GCP network ID | `gcp_live_system.ts` |

## Selecting a provider

Set `CLOUD_PROVIDER` to one of: `aws` (default) · `azure` · `gcp`

```bash
CLOUD_PROVIDER=azure node build/src/index.js
```

## Environment variables

### Common (all providers)

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | kebab-case environment name (default: `dev`) |

### AWS (`CLOUD_PROVIDER=aws`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AWS_DATABRICKS_CREDENTIALS_ID` | no | `my-credentials` | Databricks credentials ID |
| `AWS_DATABRICKS_STORAGE_CONFIGURATION_ID` | no | `my-storage-config` | Databricks storage configuration ID |
| `AWS_DATABRICKS_NETWORK_ID` | no | _(none)_ | Databricks network ID |

### Azure (`CLOUD_PROVIDER=azure`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AZURE_MANAGED_RESOURCE_GROUP` | no | `my-managed-rg` | Managed resource group name |
| `AZURE_ENABLE_NO_PUBLIC_IP` | no | `false` | Set to `true` to enable no public IP |

### GCP (`CLOUD_PROVIDER=gcp`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GCP_DATABRICKS_NETWORK_ID` | no | _(none)_ | GCP network ID for Databricks |

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
