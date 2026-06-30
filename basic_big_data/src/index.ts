/**
 * index.ts — the DEV team consumes the governed Fractal.
 *
 * The dev never authors infrastructure: they (1) specialize the Fractal through
 * its typed Interface (the dev-open ops only — guardrails are locked), then
 * (2) build a LiveSystem by SELECTING, per component, one concrete offer from
 * the open Catalogue. Selection is the ONLY place a vendor is named.
 *
 * Here the whole data platform targets a single provider, chosen at runtime via
 * CLOUD_PROVIDER (aws | azure | gcp, default aws). The Fractal is untouched when
 * the provider changes — only the per-component offer selection differs.
 */
import {authorFractal} from './fractal';
import {
  deploy,
  AwsDatabricksCluster,
  AwsDatabricksJob,
  AwsDatabricksMlflow,
  AwsS3Datalake,
  AzureDatabricksCluster,
  AzureDatabricksJob,
  AzureDatabricksMlflow,
  AzureDatalake,
  GcpDatabricksCluster,
  GcpDatabricksJob,
  GcpDatabricksMlflow,
  GcpDatalake,
} from '@fractal_cloud/sdk/model';

const environment = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['ENVIRONMENT_NAME'] ?? 'dev',
};

// Per-component offer selection. Each branch is a coherent single-vendor data
// platform; swap CLOUD_PROVIDER to retarget the whole system — the Fractal is
// never touched. The compiler enforces that each selected offer satisfies its
// component (e.g. an S3 datalake can only be selected for the 'lake' component).
function selectionFor(provider: 'aws' | 'azure' | 'gcp') {
  switch (provider) {
    case 'azure':
      return {
        'analytics-cluster': AzureDatabricksCluster({}),
        'etl-job': AzureDatabricksJob({}),
        'fraud-model': AzureDatabricksMlflow({}),
        lake: AzureDatalake({resourceGroup: 'rg-bd'}),
      };
    case 'gcp':
      return {
        'analytics-cluster': GcpDatabricksCluster({}),
        'etl-job': GcpDatabricksJob({}),
        'fraud-model': GcpDatabricksMlflow({}),
        lake: GcpDatalake({bucketName: 'acme-lake'}),
      };
    case 'aws':
    default:
      return {
        'analytics-cluster': AwsDatabricksCluster({}),
        'etl-job': AwsDatabricksJob({}),
        'fraud-model': AwsDatabricksMlflow({}),
        lake: AwsS3Datalake({bucket: 'acme-lake'}),
      };
  }
}

async function main() {
  const provider = (process.env['CLOUD_PROVIDER'] ?? 'aws') as
    | 'aws'
    | 'azure'
    | 'gcp';

  // 1. Specialize through the Interface (dev-open ops only). Immutable: the
  //    authored Fractal is never mutated, so it stays reusable.
  // 2. Build the LiveSystem by selecting an offer per component.
  const liveSystem = authorFractal()
    .specialize()
    // Application-level operations: the app names its cluster, schedules its
    // job, and names its experiment. Guardrails (capacity, retries) are locked.
    .withClusterName('analytics')
    .withJobSchedule('0 9 * * MON-FRI')
    .withExperimentName('fraud')
    .toLiveSystem({
      name: 'basic-big-data',
      environment,
      select: selectionFor(provider),
    });

  // 3. Deploy: submit the LiveSystem and wait until Active (wait-mode logs).
  const credentials = {
    clientId: process.env['SERVICE_ACCOUNT_ID']!,
    clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
  };
  await deploy(liveSystem, credentials, {mode: 'wait'});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
