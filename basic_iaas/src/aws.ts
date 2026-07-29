/**
 * aws.ts — run the governed IaaS Fractal on AWS.
 *
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. It is fully
 * self-contained: it specializes the shared Fractal (fractal.ts), selects one
 * AWS offer per component, builds the LiveSystem, and deploys. This IaaS pattern
 * exposes no application-level operations, so `.specialize()` carries no ops.
 *
 * The ONLY cloud-specific code is the `select` map below. To target a different
 * cloud, copy this file and swap those offers (see azure.ts / gcp.ts / oci.ts /
 * hetzner.ts).
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
  const fractal = authorFractal();
  const liveSystem = fractal.specialize().toLiveSystem({
    name: 'basic-iaas',
    environment,
    // ── The ONLY cloud-specific lines: one AWS offer per component. ──
    select: {
      'main-network': AwsVpc({}),
      'public-subnet': AwsSubnet({}),
      'web-sg': AwsSecurityGroup({}),
      'api-server': Ec2Instance({
        amiId: 'ami-0abcdef1234567890',
        instanceType: 't3.micro',
      }),
      'web-server': Ec2Instance({
        amiId: 'ami-0abcdef1234567890',
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
