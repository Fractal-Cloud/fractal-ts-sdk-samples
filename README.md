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

> Deploy mode is set per sample in each `src/<cloud>.ts` (`deploy(ls, creds, {mode})`). Check the file if you need fire-and-forget instead of wait.

## Architecture

Every sample has a shared, cloud-agnostic Fractal plus one **self-contained,
runnable file per target cloud**:

```
src/
  fractal.ts   # Cloud-agnostic blueprint — authors abstract Components,
               #   their guardrails (locked params), dependencies and links.
               #   ALL structure lives here. No vendor types.
  aws.ts       # Self-contained entrypoint: specializes the Fractal, selects
  azure.ts     #   the AWS / Azure / GCP / … offers, builds the LiveSystem,
  gcp.ts       #   and deploys. COPY the one for your cloud and run it.
```

**`fractal.ts` is the single source of truth** for all structural decisions: dependencies between components, traffic rules, security group rules, and resource hierarchy. The blueprint references abstract Components only (`VirtualNetwork`, `Workload`, `ObjectStorage`, …) — never a vendor.

**Each `src/<cloud>.ts` names the vendor.** It is a complete, runnable program: it imports the Fractal, declares `environment` + `credentials`, and maps each blueprint component id to a concrete Offer (`AwsVpc`, `AzureVnet`, `Ec2Instance`, …) in an inline `select` map carrying that offer's vendor config. The compiler enforces that each offer satisfies the Component in that slot. **To adopt the Fractal on a cloud, copy that one file** — no driver, no env-var routing, no shared registry to untangle. The inline `select` map is the only cloud-specific code; `basic_storage/src/mixed.ts` shows one LiveSystem spanning vendors.

Self-hosted CaaS samples (observability, security) and on-prem samples (vmware, openshift) have a single file targeting their platform.

## Running a sample

```bash
cd basic_iaas       # or any sample directory
npm install
npm run compile
```

Set the common variables and any provider-specific ones (see the sample's README), then run the file for your cloud:

```bash
node build/src/aws.js      # deploy on AWS
node build/src/azure.js    # deploy on Azure
node build/src/gcp.js      # deploy on GCP
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
