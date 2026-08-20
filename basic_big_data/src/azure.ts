/**
 * azure.ts — run the governed big data Fractal on Azure.
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. Fully
 * self-contained; the ONLY cloud-specific code is the `select` map below.
 *   npm run compile && node build/src/azure.js
 */
import {fatal} from './fatal';
import {authorFractal} from './fractal';
import {
  createFractalCloudClient,
  AzureDatabricks,
  AzureDatabricksCluster,
  AzureDatabricksJob,
  AzureDatabricksMlflow,
  AzureDatalake,
} from '@fractal_cloud/sdk/model';

const environment = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['ENVIRONMENT_NAME'] ?? 'dev',
};

const credentials = {
  clientId: process.env['SERVICE_ACCOUNT_ID']!,
  clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
};

const cloud = createFractalCloudClient(credentials);

async function main() {
  const fractal = authorFractal();
  const liveSystem = fractal
    .specialize()
    .withClusterName('analytics')
    .withJobSchedule('0 9 * * MON-FRI')
    .withExperimentName('fraud')
    .toLiveSystem({
      name: 'basic-big-data',
      environment,
      select: {
        'analytics-workspace': AzureDatabricks({pricingTier: 'premium'}),
        'analytics-cluster': AzureDatabricksCluster({}),
        'etl-job': AzureDatabricksJob({}),
        'fraud-model': AzureDatabricksMlflow({}),
        lake: AzureDatalake({resourceGroup: 'rg-bd'}),
      },
    });

  const bc = liveSystem.boundedContext;
  console.log(
    'LIVE_SYSTEM_ID=' +
      [
        bc.ownerType ?? 'Personal',
        bc.ownerId ?? '',
        bc.name ?? '',
        liveSystem.name,
      ].join('/'),
  );
  // A blueprint and a LiveSystem are different entities. Register the
  // reusable, vendor-agnostic blueprint first; the API rejects a LiveSystem
  // whose Fractal is not registered.
  await cloud.blueprints.create(fractal);
  await cloud.liveSystems.deploy(liveSystem, {
    mode: (process.env['DEPLOY_MODE'] as 'wait' | 'fire-and-forget') ?? 'wait',
  });
}

main().catch(fatal);
