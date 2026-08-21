# Cloud account cleanup

Scripts that remove the Fractal Cloud resources from an AWS, Azure, or GCP account.

Deleting an environment in Fractal Cloud stops the management layer and **leaves your
infrastructure running** — that is deliberate, so opting out of Fractal Cloud never causes an
outage. It also means the resources, and their bill, are still there afterwards. These scripts are
the separate, explicit step that removes them.

Use them when you are leaving Fractal Cloud and want the account empty, or when an initialization
failed part-way and you want to retry from a clean account.

> **These scripts delete infrastructure and its data. There is no undo and no snapshot is taken.**
> Always do a `--dry-run` pass first and read what it lists.

## What gets deleted

Every resource Fractal Cloud creates is tagged the moment it is created with a `managed-by` marker,
and the AWS and Azure scripts use that marker to decide what is theirs. An account that also carries
your own workloads is safe to run them against.

Two systems provision into your account and they write different values, so both are matched:

| Marker | Written by | Covers |
|---|---|---|
| `managed-by = Fractal Cloud` (AWS)<br>`managed-by = Fractal` (Azure) | The environments service, during environment initialization | The Cloud Agent, its network, database, registry and secrets |
| `managed-by = fractal-cloud` | The Cloud Agents | Everything your Live Systems provisioned |

### Scope per cloud

| Cloud | Scope | Left alone |
|---|---|---|
| **AWS** | Resources carrying either marker. Two classes AWS cannot tag at create time are matched by name instead: ECS task definition families `fractal-*`, and IAM roles `Fractal*` (never the role the script is itself running as). | Everything else in the account, and each region's default VPC |
| **Azure** | Resource groups carrying either marker. Deleting a resource group cascades to its contents. | Every other resource group in the subscription |
| **GCP** | **The whole project.** | The default VPC network, IAM service accounts, and the project itself |

> **GCP is project-scoped, not label-scoped.** GCP supports no labels at all on VPC networks,
> subnets, firewall rules, Cloud Routers or Serverless VPC Access connectors — and that is most of
> what environment initialization creates there, so there is nothing to filter on. Every resource of
> a swept type in the project goes, whoever created it. Point the GCP script only at the project you
> nominated for Fractal Cloud. If that project also carries work of your own, delete by hand instead.

## Before you start

Delete the environment in Fractal Cloud **first**. If the agent is still running it will watch its
own resources disappear and try to reconcile them back.

| Cloud | Needs |
|---|---|
| AWS | AWS CLI v2, `jq`, credentials for the account (a profile or environment credentials), and the permissions in [`fractal-cleanup-policy.json`](./fractal-cleanup-policy.json) |
| Azure | Azure CLI, authenticated, Contributor or Owner on the subscription |
| GCP | `gcloud`, `jq`, authenticated, Editor or Owner on the project |

For AWS you can attach the bundled policy to whichever principal you run as:

```bash
aws iam put-role-policy \
  --role-name <your-role> \
  --policy-name FractalCloudCleanup \
  --policy-document file://fractal-cleanup-policy.json
```

The AWS script runs a preflight permission check and refuses to start when something is missing,
rather than half-deleting and failing later with a confusing dependency error.

## Running

Start with a dry run every time. It performs the same discovery and prints every deletion it would
make, without calling a single delete API.

```bash
# AWS — scans every enabled region unless you narrow it with --region
./fractal-aws-cleanup.sh --profile my-profile --dry-run
./fractal-aws-cleanup.sh --profile my-profile

# Azure
./fractal-azure-cleanup.sh --subscription <subscription-id> --dry-run
./fractal-azure-cleanup.sh --subscription <subscription-id>

# GCP
./fractal-gcp-cleanup.sh --project <project-id> --dry-run
./fractal-gcp-cleanup.sh --project <project-id>
```

Confirmation asks you to type the account ID, subscription ID, or project ID — not `yes` — so a
script pointed at the wrong target stops at the prompt.

### Options

| Flag | Clouds | Effect |
|---|---|---|
| `--dry-run` | all | Discover and report, delete nothing |
| `--yes` | all | Skip the confirmation prompt. For automation only |
| `--profile` | AWS | AWS CLI profile. Optional when credentials come from the environment |
| `--region` | AWS | Limit to one region instead of every enabled region |
| `--report-dir <path>` | all | Write the Markdown run report to a directory. Omitted, the report lives in a temp directory and is discarded |

## Reading the report

- **Deleted** — the delete call succeeded.
- **Already in progress** — the resource was mid-deletion from an earlier run. Nothing to do.
- **Not found** — the resource disappeared between discovery and deletion, usually because deleting
  its parent took it along. Not an error.
- **Failed** — the delete call was rejected. These are what to act on.

The scripts exit non-zero when anything failed, so they are safe to chain.

## When something fails

Cleanup is idempotent — re-running after fixing a failure is always safe.

**`DependencyViolation` on a subnet or VPC (AWS).** Something still holds a network interface. The
script drains the ones it can, but a resource created outside Fractal Cloud inside a Fractal VPC
will hold one. Remove it and re-run.

**A region timed out (AWS).** RDS deletions dominate the teardown and a region with several
databases can outrun the 45-minute per-region budget. The report names the region; re-run with
`--region <that-region>` and it picks up where it stopped.

**`DenyAssignmentAuthorizationFailed` (Azure).** A Databricks-managed resource group, protected by a
system deny assignment. It goes when its parent workspace's resource group does, and the script
already excludes it.

**Azure deletions look incomplete.** They are asynchronous. The script returns once each resource
group deletion has been accepted; the groups take several more minutes to disappear.

## Tests

```bash
./tests/cleanup-tag-scope.test.sh
```

Drives each script end-to-end against a stubbed CLI holding one Fractal-owned and one customer-owned
resource of each kind, and asserts the Fractal ones are planned for deletion and the customer ones
are not. Requires `bash`, GNU `timeout`, and `jq`.
