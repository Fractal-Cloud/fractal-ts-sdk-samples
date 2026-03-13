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
| [basic_container_platform](./basic_container_platform) | AWS · Azure · GCP | fire-and-forget | VPC + Subnet + Security Group + container platform + two workloads (ECS Fargate / Container Apps / Cloud Run) |
| [basic_cicd](./basic_cicd) | AWS | wait (blocks until Active) | CI/CD pipeline deployment — process exits 0 on success, 1 on failure |
| [basic_storage](./basic_storage) | AWS · Azure · GCP | fire-and-forget | PostgreSQL DBMS + Database + object storage (S3 / Storage Account / Cloud Storage) |
| [basic_messaging](./basic_messaging) | Azure · GCP | fire-and-forget | Message broker + two topics (Service Bus / Pub/Sub) |
| [basic_big_data](./basic_big_data) | AWS · Azure · GCP | fire-and-forget | Databricks workspace + Spark cluster + ETL job + MLflow experiment |
| [basic_api_management](./basic_api_management) | AWS · Azure · GCP | fire-and-forget | API Gateway (CloudFront / Azure API Management / GCP API Gateway) |
| [basic_observability](./basic_observability) | CaaS | fire-and-forget | Monitoring + Tracing + Logging (Prometheus + Jaeger + Elastic) |
| [basic_security](./basic_security) | CaaS | fire-and-forget | Service Mesh (Ocelot) |

## Architecture

Every sample follows the same layout:

```
src/
  fractal.ts              # Cloud-agnostic blueprint — ALL structure defined here
  aws_live_system.ts      # AWS vendor parameters only
  azure_live_system.ts    # Azure vendor parameters only     <- where applicable
  gcp_live_system.ts      # GCP vendor parameters only      <- where applicable
  oci_live_system.ts      # OCI vendor parameters only      <- where applicable
  hetzner_live_system.ts  # Hetzner vendor parameters only  <- where applicable
  caas_live_system.ts     # CaaS vendor parameters only     <- where applicable
  index.ts                # Entry point — CLOUD_PROVIDER selects the provider
```

**`fractal.ts` is the single source of truth** for all structural decisions: dependencies between components, traffic rules, security group rules, and resource hierarchy. Each `*_live_system.ts` file adds only the vendor-specific parameters required to provision on that cloud — nothing structural.

For multi-provider samples, the `CLOUD_PROVIDER` environment variable selects which live system to deploy at runtime. Only that provider's environment variables need to be set, keeping each deployment minimal and self-contained. CaaS-only samples (observability, security) have no provider dispatch — they use a single `caas_live_system.ts`.

## Running a sample

```bash
cd basic_iaas       # or any sample directory
npm install
npm run compile
```

Set the common variables and any provider-specific ones (see the sample's README), then:

```bash
# Deploy on AWS (default for multi-provider samples)
node build/src/index.js

# Deploy on a different provider
CLOUD_PROVIDER=azure node build/src/index.js
CLOUD_PROVIDER=gcp   node build/src/index.js
```

### Provider support per sample

| Sample | `aws` | `azure` | `gcp` | `oci` | `hetzner` | `caas` |
|--------|-------|---------|-------|-------|-----------|--------|
| `basic_iaas` | EC2 | Azure VM | GCP VM | OCI Instance | Hetzner Server | — |
| `basic_container_platform` | ECS Fargate | Container Apps | Cloud Run | — | — | — |
| `basic_storage` | S3 | Storage Account + PostgreSQL | Cloud Storage + Cloud SQL | — | — | — |
| `basic_messaging` | — | Service Bus | Pub/Sub | — | — | — |
| `basic_big_data` | Databricks | Databricks | Databricks | — | — | — |
| `basic_api_management` | CloudFront | API Management | API Gateway | — | — | — |
| `basic_observability` | — | — | — | — | — | Prometheus + Jaeger + Elastic |
| `basic_security` | — | — | — | — | — | Ocelot |

See each sample's `README.md` for the full list of environment variables per provider.
