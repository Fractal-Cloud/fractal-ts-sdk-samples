/**
 * gcp.ts — run the governed container-platform Fractal on GCP.
 *
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. Fully
 * self-contained; the ONLY cloud-specific code is the `select` map below.
 *
 *   npm run compile && node build/src/gcp.js
 */
import {fatal} from './fatal';
import {authorFractal} from './fractal';
import {
  createFractalCloudClient,
  GcpVpc,
  GcpSubnet,
  GcpFirewall,
  Gke,
  CloudRun,
  K8sWorkload,
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
    // Application-level operations: the app picks its images + replica counts.
    .withWebImage('nginx:alpine')
    .withWebReplicas(2)
    .withApiImage('registry.access.redhat.com/ubi9/httpd-24:latest')
    .withApiReplicas(2)
    // The in-cluster tier: a public, unauthenticated image, fully qualified so
    // the CaaS agent does not prefix it with the environment's own registry.
    // Docker Hub's mirror on ECR Public rather than docker.io itself: Hub
    // throttles anonymous pulls per source IP, and a whole cluster egresses
    // through one shared NAT address, so a throttled pull would show up as an
    // ImagePullBackOff indistinguishable from a real reconcile failure.
    .withInClusterImage('public.ecr.aws/docker/library/nginx:alpine')
    .withInClusterPort(80)
    .withInClusterReplicas(1)
    .toLiveSystem({
      name: 'basic-container-platform',
      environment,
      // ── The ONLY cloud-specific lines: one GCP offer per component. ──
      select: {
        'acme-container-platform-network': GcpVpc({}),
        'private-subnet': GcpSubnet({}),
        'app-sg': GcpFirewall({}),
        'app-cluster': Gke({}),
        'web-workload': CloudRun({region: 'europe-west1'}),
        'api-workload': CloudRun({region: 'europe-west1'}),
        // The in-cluster tier: the SAME vendor-neutral CaaS offer in all three
        // files. It runs on 'app-cluster' above, whichever cloud provides it.
        'cluster-workload': K8sWorkload({namespace: 'acme-container-platform'}),
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
