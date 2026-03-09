# basic_iaas

Demonstrates a cloud-agnostic IaaS workload using the Fractal Cloud TypeScript SDK. The same blueprint deploys on **AWS, Azure, GCP, OCI, or Hetzner** — select the target provider at runtime with a single environment variable.

## What it provisions

```
VirtualNetwork  (10.0.0.0/16)
└── Subnet      (10.0.1.0/24)
    ├── web-server  — public-facing VM, proxies to api-server on port 8080
    └── api-server  — internal VM
SecurityGroup
    └── ingress: TCP 22 (SSH), TCP 80 (HTTP) from 0.0.0.0/0
```

The `web-server` → `api-server` traffic rule on port 8080 is declared once in `fractal.ts` and carried automatically to every provider's live system via `satisfy()`. No manual rule configuration is needed per provider.

## Project layout

```
src/
  fractal.ts              # Cloud-agnostic blueprint — all structure defined here
  aws_live_system.ts      # AWS:     EC2 + VPC + Subnet + Security Group
  azure_live_system.ts    # Azure:   VM  + VNet + Subnet + NSG
  gcp_live_system.ts      # GCP:     VM  + VPC Network + Subnet + Firewall
  oci_live_system.ts      # OCI:     Instance + VCN + Subnet + Security List
  hetzner_live_system.ts  # Hetzner: Server + Network + Subnet + Firewall
  index.ts                # Entry point — provider selected by CLOUD_PROVIDER
```

`fractal.ts` is the source of truth for all structural decisions (dependencies, traffic rules, security rules). Each `*_live_system.ts` file adds only the vendor-specific parameters required to provision on that cloud.

## Selecting a provider

Set `CLOUD_PROVIDER` to one of: `aws` (default) · `azure` · `gcp` · `oci` · `hetzner`

```bash
CLOUD_PROVIDER=azure node build/src/index.js
```

Only the selected provider's environment variables need to be set.

## Environment variables

### Common (all providers)

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | yes | kebab-case target environment name, e.g. `dev` |

### AWS (`CLOUD_PROVIDER=aws`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `EC2_KEY_NAME` | no | `default-key` | EC2 key pair name for SSH access |

### Azure (`CLOUD_PROVIDER=azure`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `AZURE_RESOURCE_GROUP` | yes | — | Azure resource group name |
| `AZURE_LOCATION` | no | `westeurope` | Azure region |
| `AZURE_VM_SIZE` | no | `Standard_B1s` | VM size |
| `AZURE_ADMIN_USERNAME` | no | `azureuser` | VM administrator username |

### GCP (`CLOUD_PROVIDER=gcp`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GCP_REGION` | no | `europe-west1` | GCP region |
| `GCP_ZONE` | no | `europe-west1-b` | GCP zone |
| `GCP_MACHINE_TYPE` | no | `e2-micro` | Machine type |

### OCI (`CLOUD_PROVIDER=oci`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OCI_COMPARTMENT_ID` | yes | — | OCI compartment OCID |
| `OCI_IMAGE_ID` | yes | — | OCI image OCID |
| `OCI_AVAILABILITY_DOMAIN` | no | `AD-1` | Availability domain |
| `OCI_SHAPE` | no | `VM.Standard.E4.Flex` | Compute shape |

### Hetzner (`CLOUD_PROVIDER=hetzner`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HETZNER_NETWORK_ZONE` | no | `eu-central` | Network zone |
| `HETZNER_SERVER_TYPE` | no | `cx22` | Server type |
| `HETZNER_LOCATION` | no | `nbg1` | Datacenter location |
| `HETZNER_IMAGE` | no | `ubuntu-24.04` | OS image |

## Running

```bash
npm install
npm run compile
```

Then set the common variables plus the variables for your chosen provider and run:

```bash
export SERVICE_ACCOUNT_ID=<id>
export SERVICE_ACCOUNT_SECRET=<secret>
export OWNER_ID=<uuid>
export ENVIRONMENT_NAME=dev

# AWS (default)
node build/src/index.js

# Azure
export AZURE_RESOURCE_GROUP=my-rg
CLOUD_PROVIDER=azure node build/src/index.js

# GCP
CLOUD_PROVIDER=gcp node build/src/index.js

# OCI
export OCI_COMPARTMENT_ID=ocid1.compartment...
export OCI_IMAGE_ID=ocid1.image...
CLOUD_PROVIDER=oci node build/src/index.js

# Hetzner
CLOUD_PROVIDER=hetzner node build/src/index.js
```

## Lint and type-check

```bash
npm run lint   # check
npm run fix    # auto-format
```
