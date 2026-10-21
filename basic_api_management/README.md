# basic_api_management

Demonstrates a cloud-agnostic API Gateway using the Fractal Cloud TypeScript SDK. The same blueprint deploys on **AWS (CloudFront), Azure (API Management), or GCP (API Gateway)** — select the target provider at runtime with a single environment variable.

The Fractal sets **no guardrail and no operation**. The gateway settings the SDK offers (`withHttpsOnly`, `withRateLimit`, `withCors`, a `routes` list) are honored by none of these three offers, and building a LiveSystem refuses a setting its offer cannot enforce. A guardrail nobody enforces would only look like governance, so the Fractal locks nothing it cannot keep. What a gateway serves is its offer's configuration: on GCP the routes are the `apiConfig` OpenAPI document.

## What it provisions

```
ApiGateway (acme-apim-gateway)
```

A single API Gateway component.

## Project layout

```
src/
  fractal.ts   # Architect-authored blueprint: one ApiGateway
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
| Routes (GCP: the `apiConfig` OpenAPI document) | per-cloud entrypoint — offer config |
| Vendor offer config (AWS region, Azure SKU/publisher, GCP API config) | per-cloud entrypoint — offer config |

## Selecting a provider

Each per-cloud entrypoint maps the `acme-apim-gateway` component to a concrete offer in its inline `select` map:

| Entrypoint | Offer selected | Notes |
|-----------------|----------------|-------|
| `aws.ts` | `AwsCloudFront` | no region pin: CloudFront is global |
| `azure.ts` | `AzureApiManagement` | `publisherEmail`, `skuName: 'Developer_1'` |
| `gcp.ts` | `GcpApiGateway` | `apiConfig`: the OpenAPI 2.0 document of the routes (required by the GCP agent) |

```bash
node build/src/azure.js
```

The vendor-neutral CaaS offers `Ambassador` and `Traefik` are available as swap-in alternatives — swap one into a `select` map to run the same Fractal on a Kubernetes cluster.

## Quick start

```bash
cp .sample.env .env   # then fill in the blanks
./deploy.sh           # builds and deploys the default target (aws)
./deploy.sh azure     # ...or any other target
```

`deploy.sh` loads `.env` (variables already exported in the shell win, so CI can
inject secrets without a file), then runs `npm install`, `npm run compile` and
`node build/src/<target>.js`, propagating its exit code. `.sample.env` lists every
variable this sample reads, with the required ones left blank. Targets: `aws` `azure` `gcp`.

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
