/**
 * aws.ts — run the governed container-platform Fractal on AWS.
 *
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. Fully
 * self-contained; the ONLY cloud-specific code is the `select` map below.
 *
 *   npm run compile && node build/src/aws.js
 */
import {authorFractal} from './fractal';
import {
  deploy,
  AwsVpc,
  AwsSubnet,
  AwsSecurityGroup,
  Eks,
  EcsService,
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
    // Application-level operations: the app picks its images + replica counts.
    .withWebImage('nginx:alpine')
    .withWebReplicas(2)
    .withApiImage('registry.redhat.io/ubi9/httpd-24:latest')
    .withApiReplicas(2)
    .toLiveSystem({
      name: 'basic-container-platform',
      environment,
      // ── The ONLY cloud-specific lines: one AWS offer per component. ──
      select: {
        'main-network': AwsVpc({}),
        'private-subnet': AwsSubnet({}),
        'app-sg': AwsSecurityGroup({}),
        'app-cluster': Eks({}),
        'web-workload': EcsService({launchType: 'FARGATE'}),
        'api-workload': EcsService({launchType: 'FARGATE'}),
      },
    });

  await deploy(liveSystem, credentials, {mode: 'wait'});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
