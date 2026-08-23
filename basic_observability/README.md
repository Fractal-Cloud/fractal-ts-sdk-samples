# basic_observability

Demonstrates a governed observability stack using the Fractal Cloud TypeScript SDK. The architect authors a vendor-agnostic Fractal once; the dev selects concrete offers per component and deploys.

The observability capabilities themselves are **self-hosted (CaaS)** — Prometheus, Jaeger and Elastic are Kubernetes workloads and run the same way on any cluster. What is cloud-specific is the cluster they land on and the network it sits in. So the Fractal also declares the platform it observes: a network, a subnet, a managed cluster, and the API gateway every console is published behind.

## What it provisions

```
VirtualNetwork    (platform-network)  — 10.0.0.0/16
Subnet            (platform-subnet)   — 10.0.1.0/24
ContainerPlatform (platform-cluster)  — one autoscaling system pool (2–4 nodes)
ApiGateway        (platform-gateway)  — in-cluster gateway, own namespace
Monitoring        (monitoring)        — Prometheus + Grafana + Alertmanager
                                        (retention: 30 days, scrape interval: 15 s)
Tracing           (tracing)           — Jaeger  (retention: 7 days, sampling rate: 10 %)
Logging           (logging)           — Elastic + Kibana + fluentd (retention: 30 days)
```

## Why an API gateway is part of the sample

It is not decoration. The agent publishes the observability consoles **through** the gateway:

- Grafana, Prometheus and Alertmanager are reachable because the Prometheus instantiator creates Ambassador Mappings for `/grafana/`, `/prometheus/` and `/alertmanager/` on the gateway's host.
- Kibana is reachable the same way, through a `/kibana` Mapping, and stays a `ClusterIP` service instead of taking a public load balancer of its own.

Both paths are guarded by the gateway component's type ending in `Ambassador`, so an in-cluster gateway is what the code integrates with. A managed gateway (`AzureApiManagement`, `AwsCloudFront`, `GcpApiGateway`) is not recognized as the LiveSystem's gateway at all and would leave every console unrouted.

## Project layout

```
src/
  fractal.ts   # Architect layer: vendor-agnostic blueprint — network, subnet, cluster,
               #   gateway, Monitoring, Tracing, Logging.
               #   Guardrails locked here: cidrBlock, nodePools, retentionDays,
               #   scrapeInterval, samplingRate.
               #   Structure locked here: every CaaS capability depends on the cluster
               #   (that edge is how the agent resolves which cluster to install on)
               #   and links to the gateway.
               #   No operations (platform observability; no app-level verbs to expose).
  azure.ts     # Dev layer: self-contained, runnable Azure entrypoint — copy and run.
               #   Selects one offer per component in the `select` map, then deploys.
```

### Blueprint → offer mapping

| Blueprint component | ID | Offer selected in `azure.ts` |
|---------------------|----|-------------------------------|
| `VirtualNetwork` | `platform-network` | `AzureVnet({})` |
| `Subnet` | `platform-subnet` | `AzureSubnet({})` |
| `ContainerPlatform` | `platform-cluster` | `Aks({})` |
| `ApiGateway` | `platform-gateway` | `Ambassador({namespace: 'ambassador', …})` |
| `Monitoring` | `monitoring` | `Prometheus({namespace: 'monitoring'})` |
| `Tracing` | `tracing` | `Jaeger({namespace: 'tracing'})` |
| `Logging` | `logging` | `ObservabilityElastic({namespace: 'logging'})` |

Architect guardrails (retention, scrape interval, sampling rate, CIDRs, node pools) are locked in `fractal.ts`. There are no dev-open operations — the stack is fully governed.

### The gateway's Host settings

`Ambassador` needs three settings besides its namespace before the agent will create its Host: `hostOwnerEmail`, `acmeProviderAuthority` and `tlsSecretName`. This sample sets `acmeProviderAuthority: 'none'`, which disables ACME — a public certificate authority cannot issue a certificate for a bare load-balancer IP, and the sample brings no DNS name of its own. To get a real certificate, set a `host` you own and point the authority at `https://acme-v02.api.letsencrypt.org/directory`.

### Grafana is not open

Grafana is published on the gateway's public host at `/grafana/` with no auth filter in front of it, so its own authentication is the only thing standing there. The agent generates an admin password per Monitoring component, keeps it in the environment secret store as `<component-id>-grafana-admin-password`, and mirrors it into the `grafana-admin` Kubernetes Secret the Deployment reads. Anonymous access is off.

## Quick start

```bash
cp .sample.env .env   # then fill in the blanks
./deploy.sh           # builds and deploys the default target (azure)
```

`deploy.sh` loads `.env` (variables already exported in the shell win, so CI can
inject secrets without a file), then runs `npm install`, `npm run compile` and
`node build/src/<target>.js`, propagating its exit code. `.sample.env` lists every
variable this sample reads, with the required ones left blank. This sample has a single target, `azure`.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | Kebab-case environment name (default: `dev`) |
| `BC_NAME` | no | Bounded-context name (default: `wizard`) |
| `GATEWAY_OWNER_EMAIL` | no | Owner email on the gateway's Host (default: `platform@example.com`) |
| `DEPLOY_MODE` | no | `wait` (default) or `fire-and-forget` |

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

node build/src/azure.js
```

The SDK deploys in `wait` mode and emits structured log lines (`INFO` / `CHECK` / `ERROR`) until the Live System reaches Active (or fails/times out).

## Other clouds

`aws.ts` and `gcp.ts` are mechanical: swap `AzureVnet` / `AzureSubnet` / `Aks` for `AwsVpc` / `AwsSubnet` / `Eks` or `GcpVpc` / `GcpSubnet` / `Gke` and leave the four CaaS selections untouched. They are deliberately not shipped yet — one entrypoint that is known to work is worth more than three that are assumed to.
