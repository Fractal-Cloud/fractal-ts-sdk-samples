/**
 * openshift.ts — run the Fractal on OpenShift.
 * COPY THIS FILE to adopt the Fractal on your platform, then run it. Fully
 * self-contained; the ONLY platform-specific code is the `select` map below.
 *   npm run compile && node build/src/openshift.js
 */
import {authorFractal} from './fractal';
import {
  deploy,
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

async function main() {
  const liveSystem = authorFractal()
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
  await deploy(liveSystem, credentials, {mode: 'wait'});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
