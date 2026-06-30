/**
 * index.ts — the DEV team consumes the governed Fractal.
 *
 * The dev never authors infrastructure: they (1) specialize the Fractal through
 * its typed Interface (the dev-open ops only — guardrails are locked), then
 * (2) build a LiveSystem by SELECTING, per component, one concrete offer from
 * the open Catalogue. Selection is the ONLY place a vendor is named.
 *
 * Offer selection is per-component, so a single LiveSystem can mix vendors and
 * delivery models freely (here: an AWS bucket alongside an Azure database). The
 * compiler enforces that each selected offer satisfies its component.
 */
import {authorFractal} from './fractal';
import {
  deploy,
  AwsS3,
  GcsBucket,
  AzurePostgresDbms,
  GcpPostgresDbms,
} from '@fractal_cloud/sdk/model';

const environment = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['ENVIRONMENT_NAME'] ?? 'dev',
};

// Per-component offer selection. Swap any line to change vendor — the Fractal is
// untouched. `azure`/`gcp` are coherent single-vendor systems; `mixed` shows the
// model's headline feature: heterogeneous vendors in ONE LiveSystem.
// Per-component offer selection. Only the top-level components are selected; the
// databases the app declared (withDatabases) are emitted by the chosen DBMS
// offer's family — no separate selection. Swap any line to change vendor; the
// Fractal is untouched. `mixed` shows heterogeneous vendors in ONE LiveSystem.
function selectionFor(target: 'azure' | 'gcp' | 'mixed') {
  switch (target) {
    case 'gcp':
      return {
        uploads: GcsBucket({location: 'EU'}),
        'app-dbms': GcpPostgresDbms({tier: 'db-custom-2-7680'}),
      };
    case 'mixed':
      return {
        uploads: AwsS3({bucketRegion: 'us-east-1'}), // AWS object storage…
        'app-dbms': AzurePostgresDbms({resourceGroup: 'rg-storage'}), // …+ Azure DB
      };
    case 'azure':
    default:
      return {
        uploads: AwsS3({bucketRegion: 'eu-west-1'}),
        'app-dbms': AzurePostgresDbms({resourceGroup: 'rg-storage'}),
      };
  }
}

async function main() {
  const target = (process.env['TARGET'] ?? 'mixed') as 'azure' | 'gcp' | 'mixed';

  // 1. Specialize through the Interface (dev-open ops only). Immutable: the
  //    authored Fractal is never mutated, so it stays reusable.
  // 2. Build the LiveSystem by selecting an offer per component.
  const liveSystem = authorFractal()
    .specialize()
    // Application-level operations: the app declares its folders + databases.
    .withFolders(['invoices', 'exports'])
    .withDatabases(['orders', 'audit'])
    .toLiveSystem({
      name: 'acme-storage',
      environment,
      select: selectionFor(target),
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
