/**
 * gcp.ts — run the governed MySQL Fractal on GCP.
 *
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. Fully
 * self-contained; the ONLY cloud-specific code is the `select` map below.
 *
 *   npm run compile && node build/src/gcp.js
 *
 * `network` comes from GCP_NETWORK_NAME and is the one parameter the GCP Cloud
 * SQL agent refuses to default: it throws "Network parameter is missing" when the
 * value is blank. Nothing upstream fills it in — the environment's spoke network
 * name reaches the agent's EnvironmentAggregate, but the Cloud SQL path reads the
 * component's own parameters and nothing else. It is read from the environment
 * rather than written in here because a VPC name is environment-specific: a
 * plausible wrong one passes every check in this repository and fails only
 * against the cloud.
 */
import {fatal} from './fatal';
import {authorFractal} from './fractal';
import {createFractalCloudClient, GcpMySqlDbms} from '@fractal_cloud/sdk/model';

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

/**
 * The VPC the Cloud SQL instance is peered into. Set GCP_NETWORK_NAME to the
 * spoke network of the environment you are deploying to.
 */
const network = process.env['GCP_NETWORK_NAME'];

async function main() {
  if (!network) {
    throw new Error(
      'GCP_NETWORK_NAME is not set. The GCP Cloud SQL agent requires a VPC name ' +
        'and refuses to default it; set it to the spoke network of the target ' +
        'environment (see .sample.env).',
    );
  }

  const fractal = authorFractal();
  const liveSystem = fractal.specialize().toLiveSystem({
    name: 'acme-mysql',
    environment,
    // ── The ONLY cloud-specific lines: one GCP offer per component. ──
    select: {
      // The agent reads `instanceTier`, `instanceEdition` and
      // `instanceDataDiskSizeGb`. It has never read `tier` — the spelling the
      // GCP PostgreSQL sample uses — and a parameter the published contract
      // does not declare is pruned before it reaches the agent, so a `tier`
      // here would be silently dropped. Do not copy that spelling.
      'mysql-dbms': GcpMySqlDbms({
        network,
        instanceTier: 'db-perf-optimized-N-4',
        instanceEdition: 'ENTERPRISE_PLUS',
        instanceDataDiskSizeGb: 100,
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
