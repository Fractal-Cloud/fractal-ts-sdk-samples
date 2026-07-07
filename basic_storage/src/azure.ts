/**
 * azure.ts — run the governed storage Fractal on Azure.
 *
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. It is fully
 * self-contained: it specializes the shared Fractal (fractal.ts), selects one
 * Azure offer per component, builds the LiveSystem, and deploys.
 *
 * The ONLY cloud-specific code is the `select` map below. To target a different
 * cloud, copy this file and swap those offers (see gcp.ts / mixed.ts).
 *
 *   npm run compile && node build/src/azure.js
 */
import {authorFractal} from './fractal';
import {deploy, AzureBlob, AzurePostgresDbms} from '@fractal_cloud/sdk/model';

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
      // ── The ONLY cloud-specific lines: one Azure offer per component. ──
      select: {
        uploads: AzureBlob({accountTier: 'Standard_LRS'}),
        'app-dbms': AzurePostgresDbms({resourceGroup: 'rg-storage'}),
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
