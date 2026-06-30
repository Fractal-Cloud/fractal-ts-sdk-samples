/**
 * index.ts — the DEV team consumes the governed Fractal.
 *
 * The dev never authors infrastructure: they (1) specialize the Fractal through
 * its typed Interface (the dev-open ops only — guardrails are locked), then
 * (2) build a LiveSystem by SELECTING, per component, one concrete offer from
 * the open Catalogue. Selection is the ONLY place a vendor is named.
 *
 * This sample targets a single provider — OpenShift (RedHat) — so every
 * component selects an Openshift offer. Because selection is per-component, the
 * same Fractal could be instantiated against other vendors with no change here.
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

// Per-component offer selection — every component maps to an OpenShift offer.
const select = {
  'app-network-policy': OpenshiftSecurityGroup({name: 'app-network-policy'}),
  'api-workload': OpenshiftWorkload({namespace: 'apps'}),
  'web-workload': OpenshiftWorkload({namespace: 'apps'}),
  'web-service': OpenshiftService({}),
  'app-storage': OpenshiftPersistentVolume({storageSize: '10Gi'}),
  'legacy-vm': OpenshiftVm({}),
};

async function main() {
  // 1. Specialize through the Interface (dev-open ops only). Immutable: the
  //    authored Fractal is never mutated, so it stays reusable.
  // 2. Build the LiveSystem by selecting an offer per component.
  const ls = authorFractal()
    .specialize()
    // Application-level operations: the app declares its images + replicas.
    .withApiImage('registry.redhat.io/ubi9/httpd-24:latest')
    .withApiReplicas(2)
    .withWebImage('nginx:alpine')
    .withWebReplicas(2)
    .toLiveSystem({
      name: 'basic-onprem-openshift',
      environment: {
        ownerType: 'Personal',
        ownerId: process.env['OWNER_ID'] ?? '',
        name: process.env['ENVIRONMENT_NAME'] ?? 'dev',
      },
      select,
    });

  // 3. Deploy: submit the LiveSystem and wait until Active (wait-mode logs).
  const credentials = {
    clientId: process.env['SERVICE_ACCOUNT_ID']!,
    clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
  };
  await deploy(ls, credentials, {mode: 'wait'});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
