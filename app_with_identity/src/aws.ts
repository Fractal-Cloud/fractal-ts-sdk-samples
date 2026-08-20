/**
 * aws.ts — run the app Fractal fully on AWS.
 *
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it:
 *   npm run compile && node build/src/aws.js
 *
 * The ONLY cloud-specific code is the `select` map below:
 *   - app-platform: Eks                  (managed Kubernetes; workloads run on it)
 *   - idp:          Cognito              (Amazon Cognito — the AWS IdP)
 *   - app-dbms:     AwsRdsPostgresDbms   (managed PostgreSQL; the DB child follows it)
 *
 * The workload itself is NOT selected here — it is added by the
 * `withStatefulService` operation and emitted by the platform offer (Eks) as a
 * portable Kubernetes workload.
 *
 * Note what is ABSENT: no VPC, no subnets. A managed relational database is a
 * PaaS capability, so the agent places it across the environment spoke's per-AZ
 * private subnets — the same way the managed Kubernetes offer resolves its node
 * subnets. An operator who needs the database in specific subnets declares
 * Subnet components and the agent uses those instead; nobody else has to think
 * about it.
 */
import {fatal} from './fatal';
import {authorFractal} from './fractal';
import {
  createFractalCloudClient,
  Eks,
  Cognito,
  AwsRdsPostgresDbms,
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
    // Application-level operations: name the user directory, then add a stateful
    // service (workload + its database + the links wiring them together).
    .withUserDirectory('acme')
    .withStatefulService({
      name: 'orders',
      image: 'acme/web:1.4.0',
      redirectUris: ['https://app.acme.example/oauth2/callback'],
      logoutUris: ['https://app.acme.example/logout'],
      scopes: ['openid', 'profile', 'email'],
    })
    .toLiveSystem({
      name: 'acme-app',
      environment,
      // ── The ONLY cloud-specific lines: one AWS offer per component. ──
      select: {
        'app-platform': Eks({}),
        idp: Cognito({}),
        // An Aurora PostgreSQL cluster with a Serverless v2 writer. Availability
        // and retention DEFAULTS follow the environment: a production environment
        // (networkTier=prod) gets a reader in a second zone and 14-day backups; a
        // non-production one gets a single writer and 1-day backups. Set
        // `readerCount` / `backupRetentionDays` here to override either way.
        //
        // What does NOT vary: encryption at rest, private-only networking, IAM
        // database authentication, and AWS holding the master credential in
        // Secrets Manager. Pass `mode: 'provisioned-instance'` for a single
        // instance instead of a cluster.
        'app-dbms': AwsRdsPostgresDbms({}),
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
