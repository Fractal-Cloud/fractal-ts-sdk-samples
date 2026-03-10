# fractal-ts-sdk-samples

Example projects showing how to use the [Fractal Cloud TypeScript SDK](https://github.com/fractal-cloud/fractal-ts-sdk) to define cloud infrastructure as code.

Each sample is a standalone TypeScript project. It declares a **Fractal** (cloud-agnostic blueprint) and one or more **Live Systems** (provider-specific instantiations) and deploys them to the Fractal Cloud API.

## Prerequisites

- Node.js 18+
- A Fractal Cloud account with a service account

## Samples

| Sample | Providers | Deploy mode | Description |
|--------|-----------|-------------|-------------|
| [basic_iaas](./basic_iaas) | AWS · Azure · GCP · OCI · Hetzner | fire-and-forget | VPC + Subnet + Security Group + two VMs |
| [basic_container_platform](./basic_container_platform) | AWS | fire-and-forget | VPC + Subnet + Security Group + ECS Cluster + two Fargate workloads |
| [basic_cicd](./basic_cicd) | AWS | wait (blocks until Active) | CI/CD pipeline deployment — process exits 0 on success, 1 on failure |

## Architecture

Every sample follows the same layout:

```
src/
  fractal.ts              # Cloud-agnostic blueprint — ALL structure defined here
  aws_live_system.ts      # AWS vendor parameters only
  azure_live_system.ts    # Azure vendor parameters only     ← where applicable
  gcp_live_system.ts      # GCP vendor parameters only      ← where applicable
  oci_live_system.ts      # OCI vendor parameters only      ← where applicable
  hetzner_live_system.ts  # Hetzner vendor parameters only  ← where applicable
  index.ts                # Entry point — CLOUD_PROVIDER selects the provider
```

**`fractal.ts` is the single source of truth** for all structural decisions: dependencies between components, traffic rules, security group rules, and resource hierarchy. Each `*_live_system.ts` file adds only the vendor-specific parameters required to provision on that cloud — nothing structural.

The `CLOUD_PROVIDER` environment variable selects which live system to deploy at runtime. Only that provider's environment variables need to be set, keeping each deployment minimal and self-contained.

## Running a sample

```bash
cd basic_iaas       # or basic_container_platform
npm install
npm run compile
```

Set the common variables and any provider-specific ones (see the sample's README), then:

```bash
# Deploy on AWS (default)
node build/src/index.js

# Deploy on a different provider
CLOUD_PROVIDER=azure node build/src/index.js
```

See each sample's `README.md` for the full list of environment variables per provider.
