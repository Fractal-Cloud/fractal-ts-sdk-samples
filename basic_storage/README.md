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
  azure.ts     # Self-contained Azure entrypoint — copy and run
  gcp.ts       # Self-contained GCP entrypoint — copy and run
  mixed.ts     # Self-contained mixed-vendor entrypoint (AWS bucket + Azure DB) — copy and run
```

Each `src/<cloud>.ts` is a self-contained, runnable entrypoint. It builds the
LiveSystem with `select: { componentId: Offer({...}) }`, then deploys with
`mode: 'wait'`. Pick a target by copying and running its file — there is no
dispatch. The inline `select` map is the only target-specific code.

### Blueprint / Live System split

| Concern | Declared in |
|---------|-------------|
| Engine version (`16`), HA mode, backup retention, storage size | `fractal.ts` — blueprint guardrails |
| Charset / collation per database | `fractal.ts` — blueprint guardrails |
| DBMS → Database dependency | `fractal.ts` — auto-wired by `withDatabases()` |
| Encryption, versioning, public access, retention, storage class | `fractal.ts` — blueprint guardrails |
| Application folders and database names | per-target entrypoint — operations (`.withFolders()`, `.withDatabases()`) |
| AWS S3 bucket region | per-target entrypoint — offer config (`AwsS3`) |
| Azure PostgreSQL resource group | per-target entrypoint — offer config (`AzurePostgresDbms`) |
| GCP Cloud Storage location | per-target entrypoint — offer config (`GcsBucket`) |
| GCP Cloud SQL tier | per-target entrypoint — offer config (`GcpPostgresDbms`) |

## Selecting a target

Pick a target by running its entrypoint: `azure.js` · `gcp.js` · `mixed.js`

| Entrypoint | `uploads` offer | `app-dbms` offer |
|-------|-----------------|------------------|
| `azure.ts` | `AwsS3` (eu-west-1) | `AzurePostgresDbms` (rg-storage) |
| `gcp.ts` | `GcsBucket` (EU) | `GcpPostgresDbms` (db-custom-2-7680) |
| `mixed.ts` | `AwsS3` (us-east-1) | `AzurePostgresDbms` (rg-storage) |

`mixed` is the headline example: two components in the same LiveSystem served by two different cloud vendors.

```bash
node build/src/gcp.js
```

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | kebab-case environment name (default: `dev`) |
| `BC_NAME` | no | Bounded-context name (default: `wizard`) |

Pick a target by running its entrypoint (`azure.js` · `gcp.js` · `mixed.js`) — there is no target-selection environment variable.

All offer configuration (regions, resource groups, tiers) is hardcoded in each per-target entrypoint. No additional environment variables are required.

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

node build/src/azure.js    # AWS S3 bucket + Azure PostgreSQL
node build/src/gcp.js      # GCP Cloud Storage + GCP Cloud SQL
node build/src/mixed.js    # mixed: AWS S3 bucket + Azure PostgreSQL
```

The SDK deploys in `wait` mode: it polls until the LiveSystem reaches Active status and streams structured log lines to stdout.
