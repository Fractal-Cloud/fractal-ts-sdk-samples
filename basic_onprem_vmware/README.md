# basic_onprem_vmware

Deploys a basic on-premises IaaS workload on **VMware vSphere**: a distributed port group, a VLAN segment, and two virtual machines (web server + API server).

## Components

| Blueprint | VMware Offer | Description |
|-----------|-------------|-------------|
| VirtualNetwork | VspherePortGroup | Distributed port group on a vDS |
| Subnet | VsphereVlan | VLAN segment (10.0.1.0/24) with gateway |
| VirtualMachine × 2 | VsphereVm | Template-based VMs (web + API) |

## Running

```bash
npm install
npm run compile

export SERVICE_ACCOUNT_ID="..."
export SERVICE_ACCOUNT_SECRET="..."
export OWNER_ID="..."

node build/src/index.js
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | — | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | — | Fractal Cloud service account secret |
| `OWNER_ID` | yes | — | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | `dev` | kebab-case environment name |
| `VSPHERE_DATACENTER` | no | `dc1` | vSphere datacenter name |
| `VSPHERE_CLUSTER` | no | `cluster1` | vSphere compute cluster name |
| `VSPHERE_DATASTORE` | no | `datastore1` | Datastore for VM disks |
| `VSPHERE_DV_SWITCH` | no | `dvs-main` | Distributed virtual switch name |
| `VSPHERE_TEMPLATE` | no | `ubuntu-22.04-template` | VM template name |
| `VSPHERE_FOLDER` | no | — | VM folder path |
| `VSPHERE_RESOURCE_POOL` | no | — | Resource pool name |
| `VSPHERE_SSH_PUBLIC_KEY` | no | — | SSH public key for VM access |
