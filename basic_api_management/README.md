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
  aws.ts       # Self-contained AWS entrypoint — copy and run
  azure.ts     # Self-contained Azure entrypoint — copy and run
  gcp.ts       # Self-contained GCP entrypoint — copy and run
```

Each `src/<cloud>.ts` is a self-contained, runnable entrypoint: it specializes
the Fractal, builds the LiveSystem, and deploys. Pick a cloud by copying and
running its file — there is no provider dispatch. The inline `select` map is the
only cloud-specific code; the blueprint in `fractal.ts` is identical across all.

### Blueprint / offer-selection split

| Concern | Declared in |
|---------|-------------|
| Gateway component ID, version, display name | `fractal.ts` |
| Locked guardrails: `httpsOnly`, `rateLimit`, `cors` | `fractal.ts` |
| Application routes (`withRoute`) | `fractal.ts` operations / per-cloud entrypoint specialization |
| Vendor offer config (AWS region, Azure SKU/publisher, GCP) | per-cloud entrypoint — offer config |

## Selecting a provider

Each per-cloud entrypoint maps the `api-gateway` component to a concrete offer in its inline `select` map:

| Entrypoint | Offer selected | Notes |
|-----------------|----------------|-------|
| `aws.ts` | `AwsCloudFront` | `region: 'us-east-1'` |
| `azure.ts` | `AzureApiManagement` | `publisherEmail`, `sku: 'Developer'` |
| `gcp.ts` | `GcpApiGateway` | no extra config required |

```bash
node build/src/azure.js
```

The vendor-neutral CaaS offers `Ambassador` and `Traefik` are available as swap-in alternatives — swap one into a `select` map to run the same governed Fractal on any Kubernetes cluster with no cloud provider.

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

No additional provider-specific environment variables are required — all vendor parameters are configured inline in the `select` map of each per-cloud entrypoint.

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

node build/src/aws.js      # deploy on AWS (CloudFront)
node build/src/azure.js    # deploy on Azure (API Management)
node build/src/gcp.js      # deploy on GCP (API Gateway)
```

Deploy uses `mode: 'wait'` — the process streams structured log lines (`INFO` / `CHECK` / `ERROR`) until the Live System reaches Active status or fails.
