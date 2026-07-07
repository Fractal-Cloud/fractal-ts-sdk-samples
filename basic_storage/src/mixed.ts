/**
 * mixed.ts — ONE LiveSystem spanning two clouds (AWS bucket + Azure database).
 *
 * Offer selection is per-component, so a single LiveSystem can mix vendors.
 * Copy this file and edit the `select` map to taste; everything else is shared
 * with the other entrypoints. This shows the model's headline: no global
 * provider — each component picks its own cloud.
 *
 *   npm run compile && node build/src/mixed.js
 */
import {authorFractal} from './fractal';
import {deploy, AwsS3, AzurePostgresDbms} from '@fractal_cloud/sdk/model';

const environment = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['ENVIRONMENT_NAME'] ?? 'dev',
};

const credentials = {
  clientId: process.env['SERVICE_ACCOUNT_ID']!,
  clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
};

async function main() {
  const liveSystem = authorFractal()
    .specialize()
    // Application-level operations: the app declares its folders + databases.
    .withFolders(['invoices', 'exports'])
    .withDatabases(['orders', 'audit'])
    .toLiveSystem({
      name: 'acme-storage',
      environment,
      // ── The ONLY cloud-specific lines: mix vendors per component. ──
      select: {
        uploads: AwsS3({bucketRegion: 'us-east-1'}), // AWS object storage…
        'app-dbms': AzurePostgresDbms({resourceGroup: 'rg-storage'}), // …+ Azure DB
      },
    });

  const bc = liveSystem.boundedContext;
  console.log(
    'LIVE_SYSTEM_ID=' +
      [bc.ownerType ?? 'Personal', bc.ownerId ?? '', bc.name ?? '', liveSystem.name].join('/')
  );
  await deploy(liveSystem, credentials, {
    mode: (process.env['DEPLOY_MODE'] as 'wait' | 'fire-and-forget') ?? 'wait',
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
