# basic_api_management

Demonstrates a cloud-agnostic API Gateway using the Fractal Cloud TypeScript SDK. The same blueprint deploys on **AWS (CloudFront), Azure (API Management), or GCP (API Gateway)** — select the target provider at runtime with a single environment variable.

This sample is also the clearest illustration of the **guardrails vs operations** distinction: the architect locks the gateway's security posture (HTTPS-only, rate limit, CORS allow-list) while the dev team declares application-level routes through the typed Interface.

## What it provisions

```
ApiGateway (api-gateway)
```

A single API Gateway component. The architect locks three security guardrails on it at design time: `httpsOnly`, `rateLimit`, and `cors`. The dev team appends routes via the `withRoute` operation.

## Project layout

```
src/
  fractal.ts   # Architect-authored blueprint: ApiGateway with locked guardrails + withRoute operation
  index.ts     # Dev entry point: offer selection via CLOUD_PROVIDER, then deploy
```

### Blueprint / offer-selection split

| Concern | Declared in |
|---------|-------------|
| Gateway component ID, version, display name | `fractal.ts` |
| Locked guardrails: `httpsOnly`, `rateLimit`, `cors` | `fractal.ts` |
| Application routes (`withRoute`) | `fractal.ts` operations / `index.ts` specialization |
| Vendor offer config (AWS region, Azure SKU/publisher, GCP) | `index.ts` — offer config |

## Selecting a provider

`index.ts` reads `CLOUD_PROVIDER` and maps it to a concrete offer for the `api-gateway` component:

| `CLOUD_PROVIDER` | Offer selected | Notes |
|-----------------|----------------|-------|
| `aws` (default) | `AwsCloudFront` | `region: 'us-east-1'` |
| `azure` | `AzureApiManagement` | `publisherEmail`, `sku: 'Developer'` |
| `gcp` | `GcpApiGateway` | no extra config required |

```bash
CLOUD_PROVIDER=azure node build/src/index.js
```

The vendor-neutral CaaS offers `Ambassador` and `Traefik` are imported in `index.ts` as swap-in alternatives — swap one in to run the same governed Fractal on any Kubernetes cluster with no cloud provider.

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

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUD_PROVIDER` | no | `aws` (default) · `azure` · `gcp` |

No additional provider-specific environment variables are required — all vendor parameters are configured inline in the `selectionFor` function in `index.ts`.

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

Deploy uses `mode: 'wait'` — the process streams structured log lines (`INFO` / `CHECK` / `ERROR`) until the Live System reaches Active status or fails.
