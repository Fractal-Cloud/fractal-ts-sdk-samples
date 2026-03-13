# basic_observability

Demonstrates a basic observability stack using the Fractal Cloud TypeScript SDK. This sample is **CaaS-only** — it deploys Prometheus (monitoring), Jaeger (tracing), and Elastic (logging) on a Kubernetes cluster.

## What it provisions

```
Monitoring (monitoring)  — Prometheus
Tracing    (tracing)     — Jaeger with Elasticsearch storage
Logging    (logging)     — Elastic stack (3 instances, 50Gi, Kibana enabled)
```

## Project layout

```
src/
  fractal.ts            # Cloud-agnostic blueprint: monitoring, tracing, logging
  caas_live_system.ts   # CaaS:  Prometheus + Jaeger + Elastic
  index.ts              # Entry point — no multi-provider dispatch
```

### Blueprint / Live System split

| Concern | Declared in |
|---------|-------------|
| Component IDs, versions, display names | `fractal.ts` |
| Prometheus namespace, API gateway URL | `caas_live_system.ts` |
| Jaeger namespace, storage backend | `caas_live_system.ts` |
| Elastic version, instance count, storage size, Kibana flag | `caas_live_system.ts` |

## Environment variables

This sample does not use `CLOUD_PROVIDER` — it is CaaS-only.

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | kebab-case environment name (default: `dev`) |

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

node build/src/index.js
```
