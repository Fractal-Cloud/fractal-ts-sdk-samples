# basic_onprem_vmware

Deploys a basic on-premises IaaS workload on **VMware vSphere**: a distributed port group, a VLAN segment, and two virtual machines (web server + API server).

## Project layout

| File | Role |
|------|------|
| `src/fractal.ts` | Architect-authored, vendor-agnostic Fractal. Declares abstract Components (`VirtualNetwork`, `Subnet`, `VirtualMachine × 2`), governed guardrails (CIDR blocks), dependencies, and links. Never names a vendor. |
| `src/vmware.ts` | Self-contained, runnable entry point you copy and run. Specializes the Fractal (no app-level operations here), then builds a LiveSystem by mapping each component id to a concrete VMware offer (`VspherePortGroup`, `VsphereVlan`, `VsphereVm`) in its inline `select` map. Deploys with `mode: 'wait'`. |

## Components

| Blueprint component | VMware offer | What it provisions |
|---------------------|-------------|--------------------|
| `VirtualNetwork` (`acme-onprem-vmware-network`) | `VspherePortGroup` | Distributed port group on vDS `dvs0` |
| `Subnet` (`server-vlan`) | `VsphereVlan` | VLAN segment 100, CIDR 10.184.1.0/24 |
| `VirtualMachine` (`api-server`) | `VsphereVm` | Backend VM from the `ubuntu-24.04` template |
| `VirtualMachine` (`web-server`) | `VsphereVm` | Frontend VM from the `ubuntu-24.04` template; linked to api-server on 8080/tcp |

Vendor-specific knobs (dvSwitch name, VLAN id, VM template) are offer config supplied in the `select` map inside `vmware.ts`. The blueprint in `fractal.ts` carries no trace of VMware.

## Running

```bash
npm install
npm run compile

export SERVICE_ACCOUNT_ID="..."
export SERVICE_ACCOUNT_SECRET="..."
export OWNER_ID="..."
export ENVIRONMENT_NAME="dev"

node build/src/vmware.js   # deploy on VMware vSphere
```

The deploy runs in `wait` mode and streams structured log lines until the LiveSystem reaches Active (or fails).

## Quick start

```bash
cp .sample.env .env   # then fill in the blanks
./deploy.sh           # builds and deploys the default target (vmware)
```

`deploy.sh` loads `.env` (variables already exported in the shell win, so CI can
inject secrets without a file), then runs `npm install`, `npm run compile` and
`node build/src/<target>.js`, propagating its exit code. `.sample.env` lists every
variable this sample reads, with the required ones left blank. This sample has a single target, `vmware`.

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | — | Fractal Cloud service account client ID |
| `SERVICE_ACCOUNT_SECRET` | yes | — | Fractal Cloud service account client secret |
| `OWNER_ID` | yes | — | UUID of the Fractal Cloud owner (bounded context) |
| `ENVIRONMENT_NAME` | no | `dev` | Kebab-case environment name |
| `BC_NAME` | no | `wizard` | Bounded-context name |
