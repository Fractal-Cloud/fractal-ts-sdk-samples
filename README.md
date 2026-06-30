# fractal-ts-sdk-samples

Example projects showing how to use the [Fractal Cloud TypeScript SDK](https://github.com/fractal-cloud/fractal-ts-sdk) to define cloud infrastructure as code.

Each sample is a standalone TypeScript project. It authors a **Fractal** (cloud-agnostic blueprint of abstract Components) and builds a **Live System** by selecting, per component, a concrete provider-specific **Offer** — then deploys it to the Fractal Cloud API. Offer selection is the only place a vendor is named; mixed-vendor live systems are allowed.

## Prerequisites

- Node.js 18+
- A Fractal Cloud account with a service account

## Samples

| Sample | Providers | Deploy mode | Description |
|--------|-----------|-------------|-------------|
| [basic_iaas](./basic_iaas) | AWS · Azure · GCP · OCI · Hetzner | wait | VPC + Subnet + Security Group + two VMs |
| [basic_container_platform](./basic_container_platform) | AWS · Azure · GCP | wait | VPC + Subnet + Security Group + container platform + two workloads (ECS / Container Apps / Cloud Run) |
| [basic_cicd](./basic_cicd) | AWS | wait (blocks until Active) | CI/CD pipeline deployment — process exits 0 on success, 1 on failure |
| [basic_storage](./basic_storage) | AWS · Azure · GCP | wait | Object storage + PostgreSQL DBMS + Database (S3 / Storage Account / Cloud Storage) |
| [basic_messaging](./basic_messaging) | Azure · GCP | wait | Message broker + two topics (Service Bus / Pub/Sub) |
| [basic_big_data](./basic_big_data) | AWS · Azure · GCP | wait | Databricks workspace + Spark cluster + ETL job + MLflow experiment |
| [basic_api_management](./basic_api_management) | AWS · Azure · GCP | wait | API Gateway (CloudFront / Azure API Management / GCP API Gateway) |
| [basic_observability](./basic_observability) | self-hosted (CaaS) | wait | Monitoring + Tracing + Logging (Prometheus + Jaeger + Elastic) |
| [basic_security](./basic_security) | self-hosted (CaaS) | wait | Service Mesh (Ocelot) |
| [basic_onprem_vmware](./basic_onprem_vmware) | VMware | wait | Port Group + VLAN + two vSphere VMs |
| [basic_onprem_openshift](./basic_onprem_openshift) | OpenShift | wait | NetworkPolicy + two Workloads + Service/Route + PersistentVolume + KubeVirt VM |

> Deploy mode is set per sample in its `index.ts` (`deploy(ls, creds, {mode})`). Check the sample if you need fire-and-forget instead of wait.

## Architecture

Every sample follows the same two-file layout:

```
src/
  fractal.ts   # Cloud-agnostic blueprint — authors abstract Components,
               #   their guardrails (locked params), dependencies and links.
               #   ALL structure lives here. No vendor types.
  index.ts     # Entry point. Specializes the Fractal, then builds a LiveSystem
               #   by per-component OFFER SELECTION (the `select` map). For
               #   multi-provider samples, CLOUD_PROVIDER picks which offer set
               #   to select. Then calls deploy(...).
```

**`fractal.ts` is the single source of truth** for all structural decisions: dependencies between components, traffic rules, security group rules, and resource hierarchy. The blueprint references abstract Components only (`VirtualNetwork`, `Workload`, `ObjectStorage`, …) — never a vendor.

**`index.ts` names the vendors.** It maps each blueprint component id to a concrete Offer (`AwsVpc`, `AzureVnet`, `Ec2Instance`, …) carrying that offer's vendor config. The compiler enforces that each selected offer satisfies the Component in that slot. To retarget a component to another vendor, swap one line in the `select` map — the Fractal is never touched.

For multi-provider samples, the `CLOUD_PROVIDER` environment variable selects which offer set to use at runtime. Only that provider's environment variables need to be set. Self-hosted CaaS samples (observability, security) have no provider dispatch — they select vendor-neutral offers directly.

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

| Sample | `aws` | `azure` | `gcp` | `oci` | `hetzner` | self-hosted | `vmware` | `openshift` |
|--------|-------|---------|-------|-------|-----------|--------|----------|-------------|
| `basic_iaas` | EC2 | Azure VM | GCP VM | OCI Instance | Hetzner Server | — | — | — |
| `basic_container_platform` | ECS | Container Apps | Cloud Run | — | — | — | — | — |
| `basic_storage` | S3 | Storage Account + PostgreSQL | Cloud Storage + Cloud SQL | — | — | — | — | — |
| `basic_messaging` | — | Service Bus | Pub/Sub | — | — | — | — | — |
| `basic_big_data` | Databricks | Databricks | Databricks | — | — | — | — | — |
| `basic_api_management` | CloudFront | API Management | API Gateway | — | — | — | — | — |
| `basic_observability` | — | — | — | — | — | Prometheus + Jaeger + Elastic | — | — |
| `basic_security` | — | — | — | — | — | Ocelot | — | — |
| `basic_onprem_vmware` | — | — | — | — | — | — | PortGroup + VLAN + VMs | — |
| `basic_onprem_openshift` | — | — | — | — | — | — | — | Workloads + Service + NetworkPolicy + PV + VM |

See each sample's `README.md` for the full list of environment variables per provider.
</content>
