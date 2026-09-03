/**
 * aws.ts — run the governed CI/CD Fractal on AWS.
 *
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. Fully
 * self-contained; the ONLY cloud-specific code is the `select` map below.
 *
 * Deploy runs in `wait` mode: the process blocks until the LiveSystem reaches
 * Active and exits non-zero on failure — the correct shape for a CI/CD gate.
 *
 *   npm run compile && node build/src/aws.js
 */
import {fatal} from './fatal';
import {authorFractal} from './fractal';
import {
  createFractalCloudClient,
  AwsVpc,
  AwsSubnet,
  AwsSecurityGroup,
  Ec2Instance,
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
  // Specialize (immutable) — no application operations here; the guardrails are
  // already locked in the blueprint. Build the LiveSystem by selecting an offer
  // per component.
  const fractal = authorFractal();
  const liveSystem = fractal.specialize().toLiveSystem({
    name: 'basic-cicd',
    environment,
    // ── The ONLY cloud-specific lines: one AWS offer per component. ──
    // Vendor-only knobs (amiId, instanceType) are offer config; both VMs
    // share the same AMI but differ in instance size.
    select: {
      'acme-cicd-network': AwsVpc({}),
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
