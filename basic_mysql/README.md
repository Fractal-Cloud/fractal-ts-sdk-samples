# basic_mysql — GCP Cloud SQL for MySQL

One abstract `Storage.RelationalDbms` component, satisfied by the GCP Cloud SQL
for MySQL offer.

```
cp .sample.env .env    # fill in SERVICE_ACCOUNT_ID / _SECRET / OWNER_ID / GCP_NETWORK_NAME
./deploy.sh gcp
```

## What it does NOT do, and why

**No databases.** Every other DBMS sample declares its logical databases through
a `withDatabases` operation and the selected offer emits one
`RelationalDatabase` live component per name. `Storage.PaaS.GcpMySqlDbms` ships
the DBMS tier only: `Storage.PaaS.GcpMySqlDatabase` does not exist yet, so the
offer omits `instantiate` and `toLiveSystem` refuses a DBMS that has children
rather than emitting a component type no agent handles.

So a MySQL instance created from this sample has **no application database and
no linked-workload credentials**. That is the deliberate scope of the offer, not
an omission in the sample: the problem the offer exists to solve is
*recognising* a Cloud SQL MySQL instance that a discovery scan found, not
provisioning a full database stack. When the Database tier lands, this sample
gains the operation and the child components in that change.

**No object storage, no second cloud.** `basic_storage` already covers the
multi-component and mixed-vendor shapes; this sample exists to exercise one
offer.

## GCP_NETWORK_NAME

Required, and the only parameter the agent refuses to default — it throws
`Network parameter is missing` when it is blank, and nothing upstream supplies
it. Set it to the spoke network of the target environment. It is not defaulted
here because a VPC name is environment-specific: a plausible wrong one passes
every check in this repository and fails only against the cloud.

## Parameter spelling

The agent reads `instanceTier`, `instanceEdition` and `instanceDataDiskSizeGb`.
The offer config is generated from the agent's published contract, so a
misspelled key does not compile. `instanceDataDiskSizeGb` is the Fractal's locked
`storageGb` guardrail (100 GB): setting it in the offer config as well is refused.

## Guardrails

Storage is the only guardrail the Fractal locks. The Cloud SQL for MySQL agent
declares no availability, backup retention or engine version, and building a
LiveSystem refuses a guardrail its offer cannot enforce.
