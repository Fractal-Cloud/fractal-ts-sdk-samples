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
import {authorFractal} from './fractal';
import {
  deploy,
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

async function main() {
  // Specialize (immutable) — no application operations here; the guardrails are
  // already locked in the blueprint. Build the LiveSystem by selecting an offer
  // per component.
  const liveSystem = authorFractal()
    .specialize()
    .toLiveSystem({
      name: 'basic-cicd',
      environment,
      // ── The ONLY cloud-specific lines: one AWS offer per component. ──
      // Vendor-only knobs (amiId, instanceType) are offer config; both VMs
      // share the same AMI but differ in instance size.
      select: {
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
      },
    });

  await deploy(liveSystem, credentials, {mode: 'wait'});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
