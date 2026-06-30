/**
 * aws.ts — run the governed big data Fractal on AWS.
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. Fully
 * self-contained; the ONLY cloud-specific code is the `select` map below.
 *   npm run compile && node build/src/aws.js
 */
import {authorFractal} from './fractal';
import {
  deploy,
  AwsDatabricksCluster,
  AwsDatabricksJob,
  AwsDatabricksMlflow,
  AwsS3Datalake,
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
        'analytics-cluster': AwsDatabricksCluster({}),
        'etl-job': AwsDatabricksJob({}),
        'fraud-model': AwsDatabricksMlflow({}),
        lake: AwsS3Datalake({bucket: 'acme-lake'}),
      },
    });

  await deploy(liveSystem, credentials, {mode: 'wait'});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
