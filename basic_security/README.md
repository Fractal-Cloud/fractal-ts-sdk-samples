# basic_security

Demonstrates a service mesh using the Fractal Cloud TypeScript SDK. This sample is **CaaS-only** — it deploys an Ocelot service mesh on a Kubernetes cluster.

## What it provisions

```
ServiceMesh (service-mesh) — Ocelot
```

A single service mesh component with host routing, CORS, and cookie configuration.

## Project layout

```
src/
  fractal.ts            # Cloud-agnostic blueprint: service mesh
  caas_live_system.ts   # CaaS:  Ocelot
  index.ts              # Entry point — no multi-provider dispatch
```

### Blueprint / Live System split

| Concern | Declared in |
|---------|-------------|
| Component ID, version, display name | `fractal.ts` |
| Ocelot namespace, host, owner email, CORS origins, cookie max age | `caas_live_system.ts` |

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
