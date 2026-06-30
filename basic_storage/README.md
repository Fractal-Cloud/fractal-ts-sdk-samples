# basic_storage

Demonstrates a cloud-agnostic storage workload using the Fractal Cloud TypeScript SDK. The same blueprint deploys on **AWS, Azure, or GCP** — select the target at runtime with a single environment variable.

## What it provisions

```
ObjectStorage (uploads) — encrypted, versioned, private, 90-day retention, standard class

RelationalDbms (app-dbms) — PostgreSQL 16, zone-redundant HA, 30-day backup, 100 GB
+-- RelationalDatabase (orders) — charset: UTF8, collation: en_US.utf8
+-- RelationalDatabase (audit)  — charset: UTF8, collation: en_US.utf8
```

The DBMS → Database dependency is auto-wired by `withDatabases()` in the blueprint. The databases are emitted by the selected DBMS offer in its own vendor family — no separate offer selection is needed for them.

## Project layout

```
src/
  fractal.ts   # Cloud-agnostic blueprint: ObjectStorage, RelationalDbms, RelationalDatabase.
               # Guardrails (encryption, HA, backup, version, charset/collation) locked here.
               # Operations expose withFolders() and withDatabases() to the dev team.
  index.ts     # Entry point — offer selection per component (dispatch via TARGET).
               # Builds the LiveSystem with select: { componentId: Offer({...}) },
               # then deploys with mode: 'wait'.
```

### Blueprint / Live System split

| Concern | Declared in |
|---------|-------------|
| Engine version (`16`), HA mode, backup retention, storage size | `fractal.ts` — blueprint guardrails |
| Charset / collation per database | `fractal.ts` — blueprint guardrails |
| DBMS → Database dependency | `fractal.ts` — auto-wired by `withDatabases()` |
| Encryption, versioning, public access, retention, storage class | `fractal.ts` — blueprint guardrails |
| Application folders and database names | `index.ts` — operations (`.withFolders()`, `.withDatabases()`) |
| AWS S3 bucket region | `index.ts` — offer config (`AwsS3`) |
| Azure PostgreSQL resource group | `index.ts` — offer config (`AzurePostgresDbms`) |
| GCP Cloud Storage location | `index.ts` — offer config (`GcsBucket`) |
| GCP Cloud SQL tier | `index.ts` — offer config (`GcpPostgresDbms`) |

## Selecting a target

Set `TARGET` to one of: `azure` (default) · `gcp` · `mixed`

| Value | `uploads` offer | `app-dbms` offer |
|-------|-----------------|------------------|
| `azure` | `AwsS3` (eu-west-1) | `AzurePostgresDbms` (rg-storage) |
| `gcp` | `GcsBucket` (EU) | `GcpPostgresDbms` (db-custom-2-7680) |
| `mixed` | `AwsS3` (us-east-1) | `AzurePostgresDbms` (rg-storage) |

`mixed` is the headline example: two components in the same LiveSystem served by two different cloud vendors.

```bash
TARGET=gcp node build/src/index.js
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | kebab-case environment name (default: `dev`) |
| `BC_NAME` | no | Bounded-context name (default: `wizard`) |
| `TARGET` | no | Offer selection target: `azure` (default), `gcp`, or `mixed` |

All offer configuration (regions, resource groups, tiers) is hardcoded in `index.ts`. No additional environment variables are required.

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

# Azure S3 bucket + Azure PostgreSQL (default)
TARGET=azure node build/src/index.js

# GCP Cloud Storage + GCP Cloud SQL
TARGET=gcp node build/src/index.js

# Mixed: AWS S3 bucket + Azure PostgreSQL
TARGET=mixed node build/src/index.js
```

The SDK deploys in `wait` mode: it polls until the LiveSystem reaches Active status and streams structured log lines to stdout.
