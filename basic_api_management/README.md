# basic_api_management

Demonstrates a cloud-agnostic API Gateway using the Fractal Cloud TypeScript SDK. The same blueprint deploys on **AWS (CloudFront), Azure (API Management), or GCP (API Gateway)** — select the target provider at runtime with a single environment variable.

## What it provisions

```
PaaSApiGateway (api-gateway)
```

A single API Gateway component — simple but demonstrates the `satisfy()` pattern across three providers with very different vendor parameters.

## Project layout

```
src/
  fractal.ts            # Cloud-agnostic blueprint: API gateway
  aws_live_system.ts    # AWS:   CloudFront
  azure_live_system.ts  # Azure: API Management
  gcp_live_system.ts    # GCP:   API Gateway
  index.ts              # Entry point — provider selected by CLOUD_PROVIDER
```

### Blueprint / Live System split

| Concern | Declared in |
|---------|-------------|
| Gateway component ID, version, display name | `fractal.ts` |
| AWS region, API key source | `aws_live_system.ts` |
| Azure region, publisher name/email, SKU | `azure_live_system.ts` |
| GCP region, API ID | `gcp_live_system.ts` |

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

No additional provider-specific environment variables are required — all vendor parameters use sensible defaults.

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

# AWS (default — CloudFront)
node build/src/index.js

# Azure (API Management)
CLOUD_PROVIDER=azure node build/src/index.js

# GCP (API Gateway)
CLOUD_PROVIDER=gcp node build/src/index.js
```
