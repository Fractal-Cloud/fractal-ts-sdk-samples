# basic_onprem_openshift

Deploys a complete on-premises **OpenShift** workload showcasing all available component types: a network policy, container workloads, a public service, persistent storage, and a virtual machine via OpenShift Virtualization.

## Project layout

| File | Role |
|------|------|
| `src/fractal.ts` | Architect-authored Fractal — abstract blueprint (SecurityGroup, two Workloads, LoadBalancer, ObjectStorage, VirtualMachine), guardrails, links, and the typed Interface (operations). |
| `src/openshift.ts` | Dev-team entry point — a self-contained, runnable file you copy and run. It specializes the Fractal through its Interface, then builds and deploys a LiveSystem by selecting one OpenShift offer per component in its inline `select` map. |

## Components

| Blueprint component | OpenShift offer | What it provisions |
|---------------------|----------------|--------------------|
| `SecurityGroup` | `OpenshiftSecurityGroup` | NetworkPolicy controlling pod traffic (HTTP on 80, API on 8080) |
| `Workload` (api-workload) | `OpenshiftWorkload` | Deployment running the API container (`httpd-24`, 2 replicas) in namespace `apps` |
| `Workload` (web-workload) | `OpenshiftWorkload` | Deployment running the web container (`nginx:alpine`, 2 replicas) in namespace `apps` |
| `LoadBalancer` (web-service) | `OpenshiftService` | ClusterIP Service + Route exposing the web workload |
| `ObjectStorage` (app-storage) | `OpenshiftPersistentVolume` | 10Gi PersistentVolumeClaim (ReadWriteOnce) |
| `VirtualMachine` (legacy-vm) | `OpenshiftVm` | KubeVirt VM provisioned via OpenShift Virtualization |

Blueprint links (declared in `fractal.ts`, enforced by the agent):
- Both workloads are members of the network policy (membership link — no settings).
- `web-workload` may reach `api-workload` on port 8080/tcp (traffic rule — agent derives the NetworkPolicy ingress entry).

## Running

```bash
npm install
npm run compile

export SERVICE_ACCOUNT_ID="..."
export SERVICE_ACCOUNT_SECRET="..."
export OWNER_ID="..."

node build/src/openshift.js   # deploy on OpenShift
```

The deploy runs in `wait` mode: structured log lines are emitted to stdout on each poll round until the LiveSystem reaches Active.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | — | Fractal Cloud service account client ID |
| `SERVICE_ACCOUNT_SECRET` | yes | — | Fractal Cloud service account client secret |
| `OWNER_ID` | yes | — | UUID of the Fractal Cloud personal account owner |
| `ENVIRONMENT_NAME` | no | `dev` | kebab-case environment name |
| `BC_NAME` | no | `wizard` | Bounded-context name |
