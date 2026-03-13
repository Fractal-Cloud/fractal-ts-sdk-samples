# basic_messaging

Demonstrates a cloud-agnostic messaging workload using the Fractal Cloud TypeScript SDK. The same blueprint deploys on **Azure (Service Bus) or GCP (Pub/Sub)** — select the target provider at runtime with a single environment variable.

## What it provisions

```
Broker (event-broker)
+-- MessagingEntity (orders-topic)        — broker dep auto-wired
+-- MessagingEntity (notifications-topic) — broker dep auto-wired
```

The broker dependency is auto-wired into each entity by the blueprint via `withEntities()`.

## Project layout

```
src/
  fractal.ts            # Cloud-agnostic blueprint: broker + two topics
  azure_live_system.ts  # Azure: Service Bus namespace + topics
  gcp_live_system.ts    # GCP:   Pub/Sub + topics
  index.ts              # Entry point — provider selected by CLOUD_PROVIDER
```

### Blueprint / Live System split

| Concern | Declared in |
|---------|-------------|
| Topic names, broker structure | `fractal.ts` — blueprint params |
| Broker → Topic dependency | `fractal.ts` — auto-wired by `withEntities()` |
| Azure region, resource group, SKU | `azure_live_system.ts` |
| GCP-specific params | `gcp_live_system.ts` |

## Selecting a provider

Set `CLOUD_PROVIDER` to one of: `azure` (default) · `gcp`

```bash
CLOUD_PROVIDER=gcp node build/src/index.js
```

## Environment variables

### Common (all providers)

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | kebab-case environment name (default: `dev`) |

### Azure (`CLOUD_PROVIDER=azure`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AZURE_LOCATION` | no | `westeurope` | Azure region |
| `AZURE_RESOURCE_GROUP` | no | `my-resource-group` | Azure resource group name |

### GCP (`CLOUD_PROVIDER=gcp`)

No additional environment variables required.

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

# Azure (default — Service Bus + Topics)
node build/src/index.js

# GCP (Pub/Sub + Topics)
CLOUD_PROVIDER=gcp node build/src/index.js
```
