/**
 * gcp.ts — run the governed big data Fractal on GCP.
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. Fully
 * self-contained; the ONLY cloud-specific code is the `select` map below.
 *   npm run compile && node build/src/gcp.js
 */
import {authorFractal} from './fractal';
import {
  deploy,
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

const credentials = {
  clientId: process.env['SERVICE_ACCOUNT_ID']!,
  clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
};

async function main() {
  const liveSystem = authorFractal()
    .specialize()
    .withClusterName('analytics')
    .withJobSchedule('0 9 * * MON-FRI')
    .withExperimentName('fraud')
    .toLiveSystem({
      name: 'basic-big-data',
      environment,
      select: {
        'analytics-cluster': GcpDatabricksCluster({}),
        'etl-job': GcpDatabricksJob({}),
        'fraud-model': GcpDatabricksMlflow({}),
        lake: GcpDatalake({bucketName: 'acme-lake'}),
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
