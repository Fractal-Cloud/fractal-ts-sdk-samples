/**
 * index.ts — the DEV team consumes the governed Fractal.
 *
 * The dev never authors infrastructure: they (1) specialize the Fractal through
 * its typed Interface (the dev-open ops only — guardrails are locked), then
 * (2) build a LiveSystem by SELECTING, per component, one concrete offer from
 * the open Catalogue. Selection is the ONLY place a vendor is named.
 *
 * Offer selection is per-component, so a single LiveSystem can mix vendors and
 * delivery models freely. Here the whole platform targets one provider, chosen
 * by CLOUD_PROVIDER (aws | azure | gcp; default aws) — swap the env var to
 * retarget the SAME Fractal at a different cloud, untouched.
 */
import {authorFractal} from './fractal';
import {
  deploy,
  AwsVpc,
  AwsSubnet,
  AwsSecurityGroup,
  Eks,
  EcsService,
  AzureVnet,
  AzureSubnet,
  AzureNsg,
  Aks,
  AzureContainerApp,
  GcpVpc,
  GcpSubnet,
  GcpFirewall,
  Gke,
  CloudRun,
} from '@fractal_cloud/sdk/model';

type Provider = 'aws' | 'azure' | 'gcp';

// Per-component offer selection. Each branch is a coherent single-vendor system:
// network + subnet + security group + managed cluster + the two workloads. The
// keys are the blueprint component IDs; the compiler enforces that each selected
// offer satisfies its slot's Component.
function selectionFor(provider: Provider) {
  switch (provider) {
    case 'azure':
      return {
        'main-network': AzureVnet({}),
        'private-subnet': AzureSubnet({}),
        'app-sg': AzureNsg({location: 'westeurope', resourceGroup: 'rg-cp'}),
        'app-cluster': Aks({}),
        'web-workload': AzureContainerApp({resourceGroup: 'rg-cp'}),
        'api-workload': AzureContainerApp({resourceGroup: 'rg-cp'}),
      };
    case 'gcp':
      return {
        'main-network': GcpVpc({}),
        'private-subnet': GcpSubnet({}),
        'app-sg': GcpFirewall({}),
        'app-cluster': Gke({}),
        'web-workload': CloudRun({region: 'europe-west1'}),
        'api-workload': CloudRun({region: 'europe-west1'}),
      };
    case 'aws':
    default:
      return {
        'main-network': AwsVpc({}),
        'private-subnet': AwsSubnet({}),
        'app-sg': AwsSecurityGroup({}),
        'app-cluster': Eks({}),
        'web-workload': EcsService({launchType: 'FARGATE'}),
        'api-workload': EcsService({launchType: 'FARGATE'}),
      };
  }
}

async function main() {
  const provider = (process.env['CLOUD_PROVIDER'] ?? 'aws') as Provider;

  // 1. Specialize through the Interface (dev-open ops only). Immutable: the
  //    authored Fractal is never mutated, so it stays reusable.
  // 2. Build the LiveSystem by selecting an offer per component.
  const liveSystem = authorFractal()
    .specialize()
    // Application-level operations: the app picks its images + replica counts.
    .withWebImage('nginx:alpine')
    .withWebReplicas(2)
    .withApiImage('registry.redhat.io/ubi9/httpd-24:latest')
    .withApiReplicas(2)
    .toLiveSystem({
      name: 'basic-container-platform',
      environment: {
        ownerType: 'Personal',
        ownerId: process.env['OWNER_ID'] ?? '',
        name: process.env['ENVIRONMENT_NAME'] ?? 'dev',
      },
      select: selectionFor(provider),
    });

  // 3. Deploy: submit the LiveSystem and wait until Active (wait-mode logs).
  await deploy(
    liveSystem,
    {
      clientId: process.env['SERVICE_ACCOUNT_ID']!,
      clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
    },
    {mode: 'wait'},
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
