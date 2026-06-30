/**
 * index.ts — the DEV team consumes the governed Fractal in a CI/CD pipeline.
 *
 * The dev never authors infrastructure. They (1) specialize the Fractal (here
 * there are no application operations to call — guardrails are already locked in
 * the blueprint), then (2) build a LiveSystem by SELECTING, per component, one
 * concrete offer from the open Catalogue. Selection is the ONLY place a vendor
 * is named.
 *
 * This sample selects AWS for every component. Because selection is per-component
 * and future-proof, swapping any line below to another offer (e.g. AzureVnet,
 * GcpVpc) repoints that slot with no change to the Fractal — and a second
 * provider could be mixed into the same LiveSystem if ever needed.
 *
 * Deploy runs in `wait` mode: the process blocks until the LiveSystem reaches
 * Active and exits non-zero on failure — the correct shape for a CI/CD gate.
 */
import {authorFractal} from './fractal';
import {
  deploy,
  AwsVpc,
  AwsSubnet,
  AwsSecurityGroup,
  Ec2Instance,
} from '@fractal_cloud/sdk/model';

async function main() {
  // Per-component offer selection — the only vendor-specific code in the sample.
  // Vendor-only knobs (amiId, instanceType) are offer config; both VMs share the
  // same AMI but differ in instance size.
  const select = {
    'main-network': AwsVpc({}),
    'public-subnet': AwsSubnet({}),
    'web-sg': AwsSecurityGroup({}),
    'api-server': Ec2Instance({
      amiId: 'ami-096a4fdbcf530d8e0',
      instanceType: 't3.small',
    }),
    'web-server': Ec2Instance({
      amiId: 'ami-096a4fdbcf530d8e0',
      instanceType: 't3.micro',
    }),
  };

  // 1. Specialize (immutable — the authored Fractal is never mutated).
  // 2. Build the LiveSystem by selecting an offer per component.
  const ls = authorFractal()
    .specialize()
    .toLiveSystem({
      name: 'basic-cicd',
      environment: {
        ownerType: 'Personal',
        ownerId: process.env['OWNER_ID'] ?? '',
        name: process.env['ENVIRONMENT_NAME'] ?? 'dev',
      },
      select,
    });

  // 3. Deploy: submit and block until Active (wait-mode structured logs).
  await deploy(
    ls,
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
