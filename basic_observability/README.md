# basic_observability

Demonstrates a governed observability stack using the Fractal Cloud TypeScript SDK. This sample is **CaaS-only (self-hosted)** — the architect authors a vendor-agnostic Fractal once; the dev selects concrete self-hosted offers (Prometheus, Jaeger, Elastic) per component and deploys with no provider dispatch.

## What it provisions

```
Monitoring (monitoring)  — Prometheus         (retention: 30 days, scrape interval: 15 s)
Tracing    (tracing)     — Jaeger             (retention: 7 days, sampling rate: 10 %)
Logging    (logging)     — ObservabilityElastic (retention: 30 days)
```

## Project layout

```
src/
  fractal.ts   # Architect layer: vendor-agnostic blueprint — Monitoring, Tracing, Logging
               #   Guardrails locked here: retentionDays, scrapeInterval, samplingRate.
               #   No operations (platform observability; no app-level verbs to expose).
  caas.ts      # Dev layer: self-contained, runnable CaaS entrypoint — copy and run.
               #   Selects one self-hosted CaaS offer per component
               #   (Prometheus / Jaeger / ObservabilityElastic) in the `select` map,
               #   then deploys. No provider switch — these offers are vendor-neutral.
```

### Blueprint → offer mapping

| Blueprint component | ID | Offer selected in `caas.ts` |
|---------------------|----|-------------------------------|
| `Monitoring` | `monitoring` | `Prometheus({})` |
| `Tracing` | `tracing` | `Jaeger({})` |
| `Logging` | `logging` | `ObservabilityElastic({})` |

Architect guardrails (retention, scrape interval, sampling rate) are locked in `fractal.ts` and apply regardless of which cluster the CaaS offers land on. There are no dev-open operations — the stack is fully governed.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | Kebab-case environment name (default: `dev`) |
| `BC_NAME` | no | Bounded-context name (default: `wizard`) |

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

node build/src/caas.js     # deploy on self-hosted CaaS
```

The SDK deploys in `wait` mode and emits structured log lines (`INFO` / `CHECK` / `ERROR`) until the Live System reaches Active (or fails/times out).
