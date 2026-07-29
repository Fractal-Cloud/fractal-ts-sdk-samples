/**
 * openshift.ts — run the Fractal on OpenShift.
 * COPY THIS FILE to adopt the Fractal on your platform, then run it. Fully
 * self-contained; the ONLY platform-specific code is the `select` map below.
 *   npm run compile && node build/src/openshift.js
 */
import {fatal} from './fatal';
import {authorFractal} from './fractal';
import {
  createFractalCloudClient,
  OpenshiftPersistentVolume,
  OpenshiftSecurityGroup,
  OpenshiftService,
  OpenshiftVm,
  OpenshiftWorkload,
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
    .withApiImage('registry.redhat.io/ubi9/httpd-24:latest')
    .withApiReplicas(2)
    .withWebImage('nginx:alpine')
    .withWebReplicas(2)
    .toLiveSystem({
      name: 'basic-onprem-openshift',
      environment,
      select: {
        'app-network-policy': OpenshiftSecurityGroup({
          name: 'app-network-policy',
        }),
        'api-workload': OpenshiftWorkload({namespace: 'apps'}),
        'web-workload': OpenshiftWorkload({namespace: 'apps'}),
        'web-service': OpenshiftService({}),
        'app-storage': OpenshiftPersistentVolume({storageSize: '10Gi'}),
        'legacy-vm': OpenshiftVm({}),
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
