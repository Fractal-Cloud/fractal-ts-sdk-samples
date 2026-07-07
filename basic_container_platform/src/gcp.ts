/**
 * gcp.ts — run the governed container-platform Fractal on GCP.
 *
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. Fully
 * self-contained; the ONLY cloud-specific code is the `select` map below.
 *
 *   npm run compile && node build/src/gcp.js
 */
import {authorFractal} from './fractal';
import {
  deploy,
  GcpVpc,
  GcpSubnet,
  GcpFirewall,
  Gke,
  CloudRun,
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
      // ── The ONLY cloud-specific lines: one GCP offer per component. ──
      select: {
        'main-network': GcpVpc({}),
        'private-subnet': GcpSubnet({}),
        'app-sg': GcpFirewall({}),
        'app-cluster': Gke({}),
        'web-workload': CloudRun({region: 'europe-west1'}),
        'api-workload': CloudRun({region: 'europe-west1'}),
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
