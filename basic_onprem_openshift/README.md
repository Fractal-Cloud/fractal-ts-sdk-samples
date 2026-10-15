# basic_onprem_openshift

Deploys a complete on-premises **OpenShift** workload showcasing all available component types: a network policy, container workloads, a public load balancer and the MetalLB IP address pool its address comes from, persistent storage, and a virtual machine via OpenShift Virtualization.

## Project layout

| File | Role |
|------|------|
| `src/fractal.ts` | Architect-authored Fractal — abstract blueprint (SecurityGroup, two Workloads, Subnet, LoadBalancer, ObjectStorage, VirtualMachine), guardrails, links, and the typed Interface (operations). |
| `src/openshift.ts` | Dev-team entry point — a self-contained, runnable file you copy and run. It specializes the Fractal through its Interface, then builds and deploys a LiveSystem by selecting one OpenShift offer per component in its inline `select` map. |

## Components

| Blueprint component | OpenShift offer | What it provisions |
|---------------------|----------------|--------------------|
| `SecurityGroup` | `OpenshiftSecurityGroup` | NetworkPolicy controlling pod traffic (HTTP on 80, API on 8080) |
| `Workload` (api-workload) | `OpenshiftWorkload` | Deployment running the API container (`httpd-24`, 2 replicas) in namespace `apps` |
| `Workload` (web-workload) | `OpenshiftWorkload` | Deployment running the web container (`nginx:alpine`, 2 replicas) in namespace `apps` |
| `Subnet` (web-lb-subnet) | `OpenshiftIpAddressPool` | MetalLB `IPAddressPool` `web-lb` (+ `L2Advertisement`) over `LB_POOL_ADDRESSES` |
| `LoadBalancer` (web-service) | `OpenshiftService` | `LoadBalancer` Service on port 80 in front of `web-workload`, its address taken from the `web-lb` pool |
| `ObjectStorage` (app-storage) | `OpenshiftPersistentVolume` | 10Gi PersistentVolumeClaim (ReadWriteOnce) |
| `VirtualMachine` (legacy-vm) | `OpenshiftVm` | KubeVirt VM (`fedora:40` container disk) provisioned via OpenShift Virtualization |

Blueprint links (declared in `fractal.ts`, enforced by the agent):
- Both workloads are members of the network policy (membership link — no settings).
- `web-workload` may reach `api-workload` on port 8080/tcp (traffic rule — agent derives the NetworkPolicy ingress entry).
- `web-service` depends on `web-lb-subnet` (its address pool) and `web-workload` (the pods it selects).

## Running

```bash
npm install
npm run compile

export SERVICE_ACCOUNT_ID="..."
export SERVICE_ACCOUNT_SECRET="..."
export OWNER_ID="..."
export LB_POOL_ADDRESSES="192.168.10.240/28"   # in the node or VLAN subnet MetalLB announces on

node build/src/openshift.js   # deploy on OpenShift
```

The deploy runs in `wait` mode: structured log lines are emitted to stdout on each poll round until the LiveSystem reaches Active.

## Quick start

```bash
cp .sample.env .env   # then fill in the blanks
./deploy.sh           # builds and deploys the default target (openshift)
```

`deploy.sh` loads `.env` (variables already exported in the shell win, so CI can
inject secrets without a file), then runs `npm install`, `npm run compile` and
`node build/src/<target>.js`, propagating its exit code. `.sample.env` lists every
variable this sample reads, with the required ones left blank. This sample has a single target, `openshift`.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | — | Fractal Cloud service account client ID |
| `SERVICE_ACCOUNT_SECRET` | yes | — | Fractal Cloud service account client secret |
| `OWNER_ID` | yes | — | UUID of the Fractal Cloud personal account owner |
| `LB_POOL_ADDRESSES` | yes | — | Comma-separated CIDRs or ranges the load balancer takes its address from (MetalLB pool) |
| `ENVIRONMENT_NAME` | no | `dev` | kebab-case environment name |
| `BC_NAME` | no | `wizard` | Bounded-context name |

## Prerequisites on the cluster

- The MetalLB Operator, and the agent granted the `metallb.io` Role in `metallb-system`
  (aria-agent-openshift v0.1.0 or later). Without MetalLB the pool waits with a status
  message and the load balancer gets no address.
- OpenShift Virtualization (KubeVirt) for the VM; Trident NFS (or set `storageClassName`)
  for the volume claim.
