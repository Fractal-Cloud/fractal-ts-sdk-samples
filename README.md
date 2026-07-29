# fractal-ts-sdk-samples

Example projects showing how to use the [Fractal Cloud TypeScript SDK](https://github.com/fractal-cloud/fractal-ts-sdk) to define cloud infrastructure as code.

Each sample is a standalone TypeScript project. It authors a **Fractal** (cloud-agnostic blueprint of abstract Components) and builds a **Live System** by selecting, per component, a concrete provider-specific **Offer** — then deploys it to the Fractal Cloud API. Offer selection is the only place a vendor is named; mixed-vendor live systems are allowed.

## Prerequisites

- Node.js 18+
- A Fractal Cloud account with a service account
- Every sample pins `"@fractal_cloud/sdk": "^2.4.5"`

## Samples

| Sample | Entrypoints (`src/*.ts`) | What it builds |
|--------|--------------------------|----------------|
| [basic_iaas](./basic_iaas) | `aws` `azure` `gcp` `oci` `hetzner` | VirtualNetwork + Subnet + SecurityGroup + two VirtualMachines, with a web→api traffic rule |
| [basic_container_platform](./basic_container_platform) | `aws` `azure` `gcp` | Network + Subnet + SecurityGroup + ContainerPlatform + two Workloads (web/api images and replicas set through operations) |
| [basic_storage](./basic_storage) | `azure` `gcp` `mixed` | ObjectStorage + RelationalDbms; the `withDatabases([...])` operation adds `RelationalDatabase` children at specialize time. `mixed.ts` spans two vendors (AWS S3 + Azure PostgreSQL) in one LiveSystem |
| [basic_messaging](./basic_messaging) | `azure` `gcp` | Broker + two MessagingEntity topics (72 h retention guardrail) |
| [basic_big_data](./basic_big_data) | `aws` `azure` `gcp` | ComputeCluster + DataProcessingJob + MlExperiment + Datalake — Databricks on all three clouds, lake on the native object store |
| [basic_api_management](./basic_api_management) | `aws` `azure` `gcp` | A single governed ApiGateway (HTTPS-only, rate limit, CORS) with routes added via the `withRoute` operation |
| [app_with_identity](./app_with_identity) | `azure` `mixed` | ContainerPlatform + RelationalDbms + IdentityProvider. `withStatefulService(...)` creates the workload + database and links them (`access: 'read-write'`) plus an OAuth `web` client on the IdP |
| [basic_gpu_inference](./basic_gpu_inference) | `gcp` (+ `destroy`) | GPU VM self-hosting vLLM (`Qwen2.5-32B-Instruct`) on an OpenAI-compatible port 8000 reachable only inside the VPC, plus a results bucket and an `Unmanaged` AI component. Also shows `liveSystems.outputs()` and `liveSystems.destroy()` |
| [basic_cicd](./basic_cicd) | `aws` | The IaaS scaffold deployed from a **CI/CD pipeline** using `wait` mode — the process exits 0 on Active, 1 on failure |
| [basic_environment](./basic_environment) | `azure` | **Environment management**: builds a management + operational Environment (cloud agent, secret, CI/CD profile) and deploys it with `cloud.environments.deploy(...)`, then deploys a LiveSystem into the operational env |
| [basic_observability](./basic_observability) | `caas` | Monitoring + Tracing + Logging, self-hosted (Prometheus + Jaeger + Elastic) |
| [basic_onprem_vmware](./basic_onprem_vmware) | `vmware` | vSphere distributed port group + VLAN segment + two VMs |
| [basic_onprem_openshift](./basic_onprem_openshift) | `openshift` | NetworkPolicy + two Workloads + Service/Route + PersistentVolume + KubeVirt VM |

## Architecture

Every sample has a shared, cloud-agnostic Fractal plus one **self-contained,
runnable file per target cloud**:

```
src/
  fractal.ts   # Cloud-agnostic blueprint — authors abstract Components,
               #   their guardrails (locked params), dependencies and links,
               #   and the typed operations that specialize it.
               #   ALL structure lives here. No vendor types.
  aws.ts       # Self-contained entrypoint: specializes the Fractal, selects
  azure.ts     #   the AWS / Azure / GCP / … offers, builds the LiveSystem,
  gcp.ts       #   and deploys. COPY the one for your cloud and run it.
deploy.sh      # Build + deploy wrapper; targets are the src/<cloud>.ts files.
.sample.env    # Template for .env — every variable the sample reads.
```

There is **no `index.ts`** and no `clouds/` directory. Platform samples name their
file after the platform (`caas.ts`, `vmware.ts`, `openshift.ts`); `mixed.ts` — in
`basic_storage` and `app_with_identity` — is one LiveSystem spanning vendors.
`basic_gpu_inference` is the one sample that factors its LiveSystem into
`live_system.ts` so that `gcp.ts` (deploy) and `destroy.ts` (teardown) share the
same `select` map.

**`fractal.ts` is the single source of truth** for all structural decisions: dependencies between components, traffic rules, security group rules, and resource hierarchy. The blueprint references abstract Components only (`VirtualNetwork`, `Workload`, `ObjectStorage`, …) — never a vendor.

**Each `src/<cloud>.ts` names the vendor.** It is a complete, runnable program: it imports the Fractal, declares `environment` + `credentials` + the `cloud` client, and maps each blueprint component id to a concrete Offer (`AwsVpc`, `AzureVnet`, `Ec2Instance`, …) in an inline `select` map carrying that offer's vendor config. The compiler enforces that each offer satisfies the Component in that slot. **To adopt the Fractal on a cloud, copy that one file** — no driver, no env-var routing, no shared registry to untangle.

Each entrypoint ends with the same two calls — a Blueprint and a LiveSystem are different entities:

```ts
await cloud.blueprints.create(fractal);              // abstract Component contracts
await cloud.liveSystems.deploy(liveSystem, {mode});  // offer-resolved
```

## Running a sample

Every sample ships a `deploy.sh` and a `.sample.env`:

```bash
cd basic_iaas         # or any sample directory
cp .sample.env .env   # then fill in the blanks
chmod 600 .env        # it holds a credential; the default 644 is world-readable
./deploy.sh           # build and deploy the sample's default target
./deploy.sh azure     # ...or pick a target; ./deploy.sh --help lists them
```

`deploy.sh` loads `.env`, validates that the variables that sample actually needs
are set, then runs `npm install`, `npm run compile` and
`node build/src/<target>.js`, propagating the program's exit code (so
`basic_cicd` still fails a pipeline on a failed deployment). A variable already
exported in the shell wins over `.env`, so CI can inject secrets without writing
a file. `.env` is git-ignored; `.sample.env` is the committed template and lists
every variable that sample reads, required ones left blank.

**`.env` format.** One `KEY=value` per line. Blank lines and lines starting with
`#` are skipped, an optional leading `export ` is ignored, whitespace around
`KEY` and around an unquoted value is trimmed, and CRLF line endings are
tolerated. Quote a value that contains spaces or `#`; only the matching outer
pair of quotes is removed, so a secret ending in the *other* quote character
keeps it.

Exactly one kind of value may span several lines: a **PEM block**, whose opening
line must be the armor itself. Nothing else may, and an unterminated quote on any
other value is refused where it occurs instead of swallowing the lines beneath it
— swallowing them is how a credential written further down `.env` ended up inside
an unrelated variable, and from there into a log:

```bash
SSH_PRIVATE_KEY="-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAA...
-----END OPENSSH PRIVATE KEY-----"
```

Inline comments are **not** stripped from a value (`#` is a legal secret
character), so keep comments on their own line — including after a closing quote,
which is itself an error rather than a guess. A malformed line — no `=`, an
unterminated quote, text after the closing quote, a line inside a PEM block that
is not PEM content, an invalid variable name, or the same key assigned twice — is
a hard error naming the offending `.env` line by *number*; the content is never
echoed, because the file holds secrets.

Two consequences worth stating outright. `.env` assigns **environment
variables**, so it can set `PATH` or `NODE_OPTIONS` and those are inherited by
`npm`, `tsc` and `node` — treat the file as executable input and keep it
`chmod 600`. And a key may appear only **once**: rather than pick the first or the
last silently, `deploy.sh` refuses, because a customer appending a corrected
credential below a stale one is exactly how the opaque `401` this parser exists
to prevent gets reintroduced.

The **targets** are just the entrypoint files: `aws`, `azure`, `gcp`, `oci`,
`hetzner`, `caas`, `vmware`, `openshift`, `mixed`, and — in
`basic_gpu_inference` — `destroy`. Each sample's `deploy.sh --help` prints its
own list.

`destroy` is an irreversible teardown, so it is the one target that asks for
confirmation: interactively it prompts for the word `destroy`, and with no TTY
(CI) it refuses unless `CONFIRM_DESTROY=yes` is set.

```bash
./deploy.sh destroy                     # prompts before tearing anything down
CONFIRM_DESTROY=yes ./deploy.sh destroy # non-interactive, e.g. in CI
```

When a deployment fails, the samples print the HTTP status, the error message and
the server's response body — never the error object itself, whose Node inspection
includes the raw request headers and therefore the service-account secret.

To run without the script, do the same thing by hand:

```bash
npm install && npm run compile && node build/src/aws.js
```

Either way the entrypoint prints `LIVE_SYSTEM_ID=<id>` on success.

The variables common to every sample:

```bash
SERVICE_ACCOUNT_ID=<id>         # required
SERVICE_ACCOUNT_SECRET=<secret> # required
OWNER_ID=<uuid>                 # required — bounded context owner
BC_NAME=<name>                  # optional — each sample has a default
ENVIRONMENT_NAME=dev            # optional — not read by basic_environment
DEPLOY_MODE=wait                # optional — 'wait' (default) or 'fire-and-forget'
```

**Deploy mode** is read from `DEPLOY_MODE` in every sample and defaults to `wait`,
which blocks until the LiveSystem is Active (or fails) and emits the structured
`INFO`/`CHECK`/`ERROR` poll log. Set `DEPLOY_MODE=fire-and-forget` for silent
submission.

Extra provider variables: `OCI_COMPARTMENT_ID` (`basic_iaas` on OCI);
`REGION`, `IMAGE_LINK`, `VM_SERVICE_ACCOUNT` (`basic_gpu_inference`);
`AZURE_*`, `SSH_PRIVATE_KEY`, `DB_PASSWORD` (`basic_environment`).

### Provider support per sample

| Sample | `aws` | `azure` | `gcp` | `oci` | `hetzner` | self-hosted | `vmware` | `openshift` |
|--------|-------|---------|-------|-------|-----------|-------------|----------|-------------|
| `basic_iaas` | EC2 | Azure VM | GCP VM | OCI Instance | Hetzner Server | — | — | — |
| `basic_container_platform` | EKS + ECS Fargate | AKS + Container Apps | GKE + Cloud Run | — | — | — | — | — |
| `basic_storage` | S3 (via `mixed.ts`) | Blob + PostgreSQL | Cloud Storage + Cloud SQL | — | — | — | — | — |
| `basic_messaging` | — | Service Bus | Pub/Sub | — | — | — | — | — |
| `basic_big_data` | Databricks + S3 lake | Databricks + ADLS | Databricks + GCS | — | — | — | — | — |
| `basic_api_management` | CloudFront | API Management | API Gateway | — | — | — | — | — |
| `app_with_identity` | EKS + Cognito (via `mixed.ts`) | AKS + Entra External ID + PostgreSQL | — | — | — | — | — | — |
| `basic_gpu_inference` | — | — | GCP GPU VM + GCS | — | — | — | — | — |
| `basic_cicd` | EC2 | — | — | — | — | — | — | — |
| `basic_environment` | — | Cloud agent + Blob | — | — | — | — | — | — |
| `basic_observability` | — | — | — | — | — | Prometheus + Jaeger + Elastic | — | — |
| `basic_onprem_vmware` | — | — | — | — | — | — | PortGroup + VLAN + VMs | — |
| `basic_onprem_openshift` | — | — | — | — | — | — | — | Workloads + Service + NetworkPolicy + PV + VM |

See each sample's `README.md` for the full list of environment variables per provider.
