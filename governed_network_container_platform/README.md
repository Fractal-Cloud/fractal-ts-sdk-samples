# governed_network_container_platform

A managed Kubernetes cluster and a workload running on it, placed in the
**environment's own governed network**. The blueprint declares no network at
all. The same blueprint deploys on **AWS (EKS), Azure (AKS) or GCP (GKE)** — pick
the target by running its entrypoint. The vendor is named only when offers are
selected.

## Molecule or atom?

This sample is **molecule mode**: the environment provides the network and the
LiveSystem is placed into it — the AWS Cloud Adoption Framework /
Well-Architected shape. Its pair, [`basic_container_platform`](../basic_container_platform),
is **atom mode**: the blueprint brings its own `VirtualNetwork`, `Subnet` and
`SecurityGroup` — home-brewed rather than provided by the environment. Both are
supported, and both keep working.

The real distinction is a **division of responsibility**, not a difference in
capability. It is about **who provides the agent's path to the cluster** — not
about whether the cluster can be private. On Azure and GCP the private posture is
the default in **both** modes, so the mode does not change it there at all.

**Pick molecule** — this sample — when the environment's governed network is the
one you are meant to be in, the usual case in a CAF-shaped landing zone. The
network follows AWS Cloud Adoption Framework / Well-Architected, the LiveSystem is
placed into it, and giving the reconciling agent its path to the cluster is the
platform's job rather than yours. There is nothing for you to build.

**Pick atom** when you bring your own network: your own address space, your own
subnets, or IaaS components such as ECS services and load balancers that must be
told which subnet to sit in. What comes with it is that **you own making the
cluster reachable by the agent**: your peering, your routing, your DNS.

### One thing to be precise about on AWS

Read this before quoting "molecule means private" anywhere. What makes an EKS
control plane private is **the agent sharing the cluster's VPC** — the agent
measures that at create time, and EKS only accepts a change afterwards through an
operator-run `UpdateClusterConfig`. It is not a consequence of the environment
providing the network.

Today the agents are deployed **only into management environments**, and each
**operational** environment gets its own AWS account and its own spoke. So for a
LiveSystem in an ordinary operational environment the agent is neither in the
cluster's VPC nor in its account, that measurement cannot succeed, and the private
posture is not selected. **The molecule promise of "private, reachable, nothing to
build" holds today for a cluster whose spoke is the network the agent runs in —
in practice, a management environment.** Extending it to ordinary environments
needs cross-account agent credentials and is being worked on separately; ask the
platform team which shape your target environment is before relying on a posture.

Azure and GCP do not have this asymmetry: the cluster is private in either mode
(see the table below), and what molecule changes there is only who owns the
routing between the agent and it.

The one rule underneath all of it: the agent needs a network path to the cluster's
API server — a route to it, and resolution of its name. In molecule mode
providing that is the platform's job. In atom mode the blueprint author provides it;
[`basic_container_platform/PRIVATE_CLUSTER.md`](../basic_container_platform/PRIVATE_CLUSTER.md)
is the per-cloud procedure for doing so.

## What it provisions

```
ContainerPlatform (governed-app-cluster)   — node pool "system", autoscaling 1–3
└── governed-cluster-workload  (deps: cluster)  — runs ON the cluster (K8s Deployment + Service)
```

That is the whole blueprint. There is no `VirtualNetwork`, no `Subnet`, no
`SecurityGroup`, and the cluster has no `dependsOn`.

## How molecule mode is expressed

**It is expressed by absence, and the SDK has no opinion about it.** There is no
molecule flag, no `useEnvironmentNetwork()`, and no offer config naming the
spoke: the SDK's `ContainerPlatform` node offers only `withNodePools`,
`withKubernetesVersion`, `withNetworkPolicyProvider` and `dependsOn`, and
`toLiveSystem` validates that each offer satisfies its component — never
topology. A blueprint with no network components is accepted exactly as one with
them.

The reconciling agent is what reads the difference, per cloud:

| | no `Subnet` dependency (this sample) | with one (`basic_container_platform`) |
|---|---|---|
| **AWS** | node subnets = the environment spoke VPC's per-AZ private subnets, resolved from the environment rather than declared. The endpoint posture is decided separately, from whether the agent shares that VPC — see the note above | node subnets = the declared `Subnet` components; a private cluster is equally available, and the blueprint author owns the peering, routing and DNS that give the agent a path to its API server — see [PRIVATE_CLUSTER.md](../basic_container_platform/PRIVATE_CLUSTER.md) |
| **Azure** | the cluster's subnet (`snet-<component id>`) is created inside the environment spoke VNet, sized against that VNet's free space (the LiveSystem's IPAM allocation is the *request*, not the result — passed through unresolved it lands outside the spoke and ARM rejects it). The cluster is private in either mode | the subnet is created in the VNet the blueprint declared |
| **GCP** | the environment spoke network — which is what GKE uses **either way**; a blueprint-declared VPC never carried the cluster on GCP. The public endpoint is off in either mode | same as molecule |

One thing molecule mode cannot do on AWS: a `Subnet` component that falls back
to the spoke is explicitly unsupported, so an IaaS component that requires a
subnet dependency (an ECS service, a load balancer, an EC2 instance) cannot be
added to this blueprint without also adding the network. That is why this sample
carries only the cluster and its in-cluster workload, while its atom pair also
runs web and api tiers on the vendor container service.

## Project layout

```
src/
  fractal.ts   # Cloud-agnostic blueprint — the cluster guardrail (node pools)
               #   plus the typed operations interface (withImage / withPort /
               #   withReplicas). Abstract Components only.
  aws.ts       # Self-contained AWS entrypoint — copy and run
  azure.ts     # Self-contained Azure entrypoint — copy and run
  gcp.ts       # Self-contained GCP entrypoint — copy and run
```

Each `src/<cloud>.ts` is a self-contained, runnable entrypoint. It specializes
the Fractal (image, port, replicas via operations), then builds the LiveSystem by
per-component OFFER SELECTION (the inline `select` map) and runs deploy() in wait
mode. The `select` map is the only cloud-specific code.

### Who owns what

| Concern | Lives in |
|---------|----------|
| Node pools / autoscaling | `fractal.ts` — guardrails (locked `.withXxx()`) |
| Dependency of the workload on the cluster | `fractal.ts` — blueprint structure (`.dependsOn`) |
| Container image, port, replica count | per-cloud entrypoint — operations (`withImage`, `withPort`, `withReplicas`) |
| Which vendor satisfies each component | per-cloud entrypoint — the `select` map |
| The network | **the environment** — nothing in this project |

## The workload's image

`governed-cluster-workload` takes `K8sWorkload`, the vendor-neutral CaaS offer,
identical in all three entrypoints. The agent that reconciles it finds the
cluster by walking the component's dependency edge, so that single `dependsOn`
is what routes it to EKS, AKS or GKE.

Its image must be **fully qualified** (`public.ecr.aws/docker/library/...`): a
host-less image is prefixed with the environment's own container registry, which
a public image is not in. It points at Docker Hub's ECR Public mirror rather than
`docker.io` because Hub rate-limits anonymous pulls per source IP, and a whole
cluster egresses through one shared NAT address, so a throttled pull looks
exactly like a failed reconcile. The mirror needs no registry credentials on any
of the three clouds.

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

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | Target environment name (default: `dev`) |
| `BC_NAME` | no | Bounded-context name (default: `wizard`) |

Pick a provider by running its entrypoint (`aws.js` · `azure.js` · `gcp.js`) — there is no provider-selection environment variable.

## Running

```bash
npm install
npm run compile

export SERVICE_ACCOUNT_ID=<id>
export SERVICE_ACCOUNT_SECRET=<secret>
export OWNER_ID=<uuid>
export ENVIRONMENT_NAME=dev

node build/src/aws.js      # deploy on AWS (EKS)
node build/src/azure.js    # deploy on Azure (AKS)
node build/src/gcp.js      # deploy on GCP (GKE)
```

The sample deploys in `wait` mode — it blocks until the live system is Active
(or exits non-zero on failure).

## Lint and type-check

```bash
npm run lint   # check
npm run fix    # auto-format
```
