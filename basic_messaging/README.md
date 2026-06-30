# basic_messaging

Demonstrates a cloud-agnostic messaging workload using the Fractal Cloud TypeScript SDK. The same blueprint deploys on **Azure (Service Bus) or GCP (Pub/Sub)** — select the target provider at runtime with a single environment variable.

## What it provisions

```
Broker (event-broker)
+-- MessagingEntity (orders-topic)        — dependsOn broker, retention 72h
+-- MessagingEntity (notifications-topic) — dependsOn broker, retention 72h
```

The broker dependency is declared in the blueprint via `.dependsOn(broker)` on each topic. Message retention (72 hours) is an architect guardrail locked in the blueprint.

## Project layout

```
src/
  fractal.ts   # Cloud-agnostic blueprint: broker + two governed topics
  index.ts     # Offer-selection entry point — CLOUD_PROVIDER picks the vendor set
```

`fractal.ts` authors the immutable Fractal once using `createFractal` with abstract `Broker` and `MessagingEntity` components. `index.ts` specializes and builds the LiveSystem by selecting one concrete offer per component, dispatched on `CLOUD_PROVIDER`.

### Blueprint / offer split

| Concern | Where |
|---------|-------|
| Broker and topic structure | `fractal.ts` — blueprint |
| Topic names, retention guardrail | `fractal.ts` — blueprint params |
| Broker → topic dependency | `fractal.ts` — `.dependsOn(broker)` |
| Azure Service Bus namespace + topic offer config | `index.ts` — offer config (`azure` branch) |
| GCP Pub/Sub + topic offer config | `index.ts` — offer config (`gcp` branch) |

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
| `BC_NAME` | no | Bounded-context name (default: `wizard`) |

### Provider selection

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLOUD_PROVIDER` | no | `azure` | Target provider: `azure` or `gcp` |

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

Deploy runs in `wait` mode: the SDK polls until the LiveSystem reaches Active and emits structured log lines to stdout.
