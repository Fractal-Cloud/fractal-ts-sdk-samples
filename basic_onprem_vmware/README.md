# basic_onprem_vmware

Deploys a basic on-premises IaaS workload on **VMware vSphere**: a distributed port group, a VLAN segment, and two virtual machines (web server + API server).

## Project layout

| File | Role |
|------|------|
| `src/fractal.ts` | Architect-authored, vendor-agnostic Fractal. Declares abstract Components (`VirtualNetwork`, `Subnet`, `VirtualMachine × 2`), governed guardrails (CIDR blocks), dependencies, and links. Never names a vendor. |
| `src/index.ts` | Offer-selection entry point. Specializes the Fractal (no app-level operations here), then builds a LiveSystem by mapping each component id to a concrete VMware offer (`VspherePortGroup`, `VsphereVlan`, `VsphereVm`). Deploys with `mode: 'wait'`. |

## Components

| Blueprint component | VMware offer | What it provisions |
|---------------------|-------------|--------------------|
| `VirtualNetwork` (`main-network`) | `VspherePortGroup` | Distributed port group on vDS `dvs0` |
| `Subnet` (`server-vlan`) | `VsphereVlan` | VLAN segment 100, CIDR 10.0.1.0/24 |
| `VirtualMachine` (`api-server`) | `VsphereVm` | Backend VM from the `ubuntu-24.04` template |
| `VirtualMachine` (`web-server`) | `VsphereVm` | Frontend VM from the `ubuntu-24.04` template; linked to api-server on 8080/tcp |

Vendor-specific knobs (dvSwitch name, VLAN id, VM template) are offer config supplied in the `select` map inside `index.ts`. The blueprint in `fractal.ts` carries no trace of VMware.

## Running

```bash
npm install
npm run compile

export SERVICE_ACCOUNT_ID="..."
export SERVICE_ACCOUNT_SECRET="..."
export OWNER_ID="..."
export ENVIRONMENT_NAME="dev"

node build/src/index.js
```

The deploy runs in `wait` mode and streams structured log lines until the LiveSystem reaches Active (or fails).

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | — | Fractal Cloud service account client ID |
| `SERVICE_ACCOUNT_SECRET` | yes | — | Fractal Cloud service account client secret |
| `OWNER_ID` | yes | — | UUID of the Fractal Cloud owner (bounded context) |
| `ENVIRONMENT_NAME` | no | `dev` | Kebab-case environment name |
| `BC_NAME` | no | `wizard` | Bounded-context name |
