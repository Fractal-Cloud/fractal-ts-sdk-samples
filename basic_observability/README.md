# basic_observability

Demonstrates a governed observability stack using the Fractal Cloud TypeScript SDK. The architect authors a vendor-agnostic Fractal once; the dev selects concrete offers per component and deploys.

The observability capabilities themselves are **self-hosted (CaaS)** — Prometheus and Jaeger are Kubernetes workloads and run the same way on any cluster. What is cloud-specific is the cluster they land on and the network it sits in. So the Fractal also declares the platform it observes: a network, a subnet, a managed cluster, and the API gateway every console is published behind.

## What it provisions

```
VirtualNetwork    (acme-observability-network) — 10.183.0.0/16
Subnet            (platform-subnet)           — 10.183.1.0/24
ContainerPlatform (platform-cluster)          — one autoscaling system pool (2–4 nodes)
ApiGateway        (platform-gateway)          — in-cluster gateway, own namespace
Monitoring        (monitoring)                — Prometheus + Grafana + Alertmanager
                                                (retention: 30 days)
Tracing           (tracing)                   — Jaeger  (retention: 7 days)
```

## Why an API gateway is part of the sample

It is not decoration. The agent publishes the observability consoles **through** the gateway:

- Grafana, Prometheus and Alertmanager are reachable because the Prometheus instantiator creates Ambassador Mappings for `/grafana/`, `/prometheus/` and `/alertmanager/` on the gateway's host.

That path is guarded by the gateway component's type ending in `Ambassador`, so an in-cluster gateway is what the code integrates with. A managed gateway (`AzureApiManagement`, `AwsCloudFront`, `GcpApiGateway`) is not recognized as the LiveSystem's gateway at all and would leave every console unrouted.

## Project layout

```
src/
  fractal.ts   # Architect layer: vendor-agnostic blueprint — network, subnet, cluster,
               #   gateway, Monitoring, Tracing.
               #   Guardrails locked here: cidrBlock, nodePools, retentionDays.
               #   Structure locked here: every CaaS capability depends on the cluster
               #   (that edge is how the agent resolves which cluster to install on)
               #   and links to the gateway.
               #   No operations (platform observability; no app-level verbs to expose).
  azure.ts     # Dev layer: runnable Azure entrypoint — copy it with azure_select.ts and run.
  azure_select.ts # The offer per component (the `select` map). Kept apart so
               #   gateway_servable.test.ts can build the LiveSystem without deploying.
```

### Blueprint → offer mapping

| Blueprint component | ID | Offer selected in `azure_select.ts` |
|---------------------|----|-------------------------------|
| `VirtualNetwork` | `acme-observability-network` | `AzureVnet({})` |
| `Subnet` | `platform-subnet` | `AzureSubnet({})` |
| `ContainerPlatform` | `platform-cluster` | `Aks({})` |
| `ApiGateway` | `platform-gateway` | `Ambassador({namespace: 'ambassador'})` |
| `Monitoring` | `monitoring` | `Prometheus({namespace: 'monitoring'})` |
| `Tracing` | `tracing` | `Jaeger({namespace: 'tracing'})` |

Architect guardrails (retention, CIDRs, node pools) are locked in `fractal.ts`. There are no dev-open operations — the stack is fully governed.

### The gateway

`aria-agent-caas-k8s` installs the gateway (Emissary-ingress) into the `ambassador` namespace and publishes it as
Service `edge-stack`, which is where the Prometheus offer looks for it. Set `host` on the gateway to a DNS
name you own to publish the consoles on it rather than on the load balancer's address. No TLS Host or certificate is
created yet.

`aria-agent-caas-k8s` is the only agent that installs an Ambassador gateway. It fails one it cannot serve, with the
reason, and installs nothing: setting `hostOwnerEmail`, `acmeProviderAuthority`, `tlsSecretName` or
`dnsZoneConfig`, linking from the gateway, depending on no cluster or on more than one, or a cluster it cannot reach
(for example `'tlsSecretName' is not served by aria-agent-caas-k8s …`). `src/gateway_servable.test.ts` fails if the
sample's gateway stops being one caas-k8s serves.

Two consequences:

- **caas-k8s must be deployed** in the environment, for the cluster's cloud. Nothing else writes the gateway, so
  without it the gateway stays `Unknown`.
- **A cluster that still runs the legacy Edge Stack** (installed by `fractal-cloud-agents` before caas-k8s owned the
  gateway) is refused, with "Nothing was changed": the two share cluster-wide CRDs. Remove the legacy install, or
  redeploy onto a fresh cluster.

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

## No logging capability

The Fractal has no `Logging` component. The Elastic stack it used to select has been retired from the platform, and
the Loki-based replacement (`GrafanaLoki` + `GrafanaAlloy`) needs object storage
for Loki's chunks, so it is a larger change than this sample takes on. Add a `Logging` component back once that is in.

## Other clouds

`aws.ts` and `gcp.ts` are mechanical: swap `AzureVnet` / `AzureSubnet` / `Aks` for `AwsVpc` / `AwsSubnet` / `Eks` or `GcpVpc` / `GcpSubnet` / `Gke` and leave the three CaaS selections untouched. They are deliberately not shipped yet — one entrypoint that is known to work is worth more than three that are assumed to.
