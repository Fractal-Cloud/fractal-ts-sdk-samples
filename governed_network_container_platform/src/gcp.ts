/**
 * gcp.ts — run the governed-network container-platform Fractal on GCP.
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
  Gke,
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
    // A public, unauthenticated image, fully qualified so the CaaS agent does
    // not prefix it with the environment's own container registry. Docker Hub's
    // mirror on ECR Public rather than docker.io itself: Hub throttles anonymous
    // pulls per source IP, and a whole cluster egresses through one shared NAT
    // address, so a throttled pull would show up as an ImagePullBackOff
    // indistinguishable from a real reconcile failure.
    .withImage('public.ecr.aws/docker/library/nginx:alpine')
    .withPort(80)
    .withReplicas(1)
    .toLiveSystem({
      name: 'governed-network-container-platform',
      environment,
      // ── The ONLY cloud-specific lines: one GCP offer per component. ──
      //
      // Note what is NOT here: no network offer, because the blueprint declares
      // no network component. The agent always places a GKE cluster in the
      // environment spoke network — on GCP a blueprint-declared VPC never
      // carried the cluster in the first place, so this sample is the honest
      // shape there.
      select: {
        'governed-app-cluster': Gke({}),
        // The workload: the SAME vendor-neutral CaaS offer in all three files.
        // It runs on 'governed-app-cluster' above, whichever cloud provides it.
        'governed-cluster-workload': K8sWorkload({
          namespace: 'governed-container-platform',
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
