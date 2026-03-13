# basic_storage

Demonstrates a cloud-agnostic storage workload using the Fractal Cloud TypeScript SDK. The same blueprint deploys on **AWS, Azure, or GCP** — select the target provider at runtime with a single environment variable.

## What it provisions

```
RelationalDbms (main-dbms) — PostgreSQL 15
+-- RelationalDatabase (app-db) — collation: en_US.utf8, charset: UTF8

FilesAndBlobs (app-storage) — object storage bucket
```

The DBMS dependency is auto-wired into the database by the blueprint — no manual wiring needed in live system files.

**Note:** AWS currently only supports the object storage component (S3). Azure and GCP support the full stack (PostgreSQL DBMS + Database + object storage).

## Project layout

```
src/
  fractal.ts            # Cloud-agnostic blueprint: DBMS, database, object storage
  aws_live_system.ts    # AWS:   S3
  azure_live_system.ts  # Azure: Storage Account + PostgreSQL Flexible Server
  gcp_live_system.ts    # GCP:   Cloud Storage + Cloud SQL PostgreSQL
  index.ts              # Entry point — provider selected by CLOUD_PROVIDER
```

### Blueprint / Live System split

| Concern | Declared in |
|---------|-------------|
| Database version (`15`), collation, charset | `fractal.ts` — blueprint params |
| DBMS → Database dependency | `fractal.ts` — auto-wired by `withDatabases()` |
| Azure region, resource group, SKU | `azure_live_system.ts` |
| GCP region, Cloud SQL tier | `gcp_live_system.ts` |
| S3 bucket name, versioning | `aws_live_system.ts` |

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
| `S3_BUCKET_NAME` | no | `my-app-storage-bucket` | S3 bucket name |

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

# AWS (default — S3 only)
node build/src/index.js

# Azure (Storage Account + PostgreSQL)
CLOUD_PROVIDER=azure node build/src/index.js

# GCP (Cloud Storage + Cloud SQL)
CLOUD_PROVIDER=gcp node build/src/index.js
```
