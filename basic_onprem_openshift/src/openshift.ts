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
  OpenshiftIpAddressPool,
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
// The addresses the web load balancer takes its address from: CIDRs or ranges
// in the subnet of the nodes (or VLAN) MetalLB announces them on, e.g.
// 192.168.10.240/28 or 192.168.10.240-192.168.10.250, comma-separated.
const lbPoolAddresses = (process.env['LB_POOL_ADDRESSES'] ?? '')
  .split(',')
  .map(a => a.trim())
  .filter(a => a !== '');
const credentials = {
  clientId: process.env['SERVICE_ACCOUNT_ID']!,
  clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
};

const cloud = createFractalCloudClient(credentials);

async function main() {
  if (lbPoolAddresses.length === 0) {
    throw new Error(
      'LB_POOL_ADDRESSES is not set: name the addresses (CIDRs or ranges) the ' +
        'web load balancer may take its address from.',
    );
  }
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
        'web-lb-subnet': OpenshiftIpAddressPool({
          name: 'web-lb',
          addresses: lbPoolAddresses,
        }),
        'web-service': OpenshiftService({
          serviceType: 'LoadBalancer',
          port: 80,
          targetPort: 80,
        }),
        'app-storage': OpenshiftPersistentVolume({
          name: 'app-storage',
          storageSize: '10Gi',
        }),
        'legacy-vm': OpenshiftVm({
          name: 'legacy-vm',
          image: 'quay.io/containerdisks/fedora:40',
        }),
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
