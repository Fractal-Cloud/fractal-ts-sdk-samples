/**
 * mixed.ts — the same app Fractal as a single MIXED-vendor LiveSystem.
 *
 *   npm run compile && node build/src/mixed.js
 *
 * This is the "EKS + Cognito + database" shape: workloads run on AWS EKS and
 * authenticate against AWS Cognito, while the relational database is on Azure.
 * Offer selection is per-component, so one LiveSystem may span vendors freely —
 * the compiler still checks each offer satisfies its component, and the Fractal
 * (fractal.ts) is untouched. The workload is not selected here: it is added by
 * `withStatefulService` and emitted by the platform offer (Eks) as a portable
 * Kubernetes workload.
 *
 * The DB is on Azure by CHOICE here, to show a LiveSystem spanning vendors — not
 * for want of an AWS option. `AwsRdsPostgresDbms` satisfies the same component
 * (see aws.ts for the all-AWS selection), so this line is a one-word swap in
 * either direction and the Fractal never changes.
 */
import {fatal} from './fatal';
import {authorFractal} from './fractal';
import {
  createFractalCloudClient,
  Eks,
  Cognito,
  AzurePostgresDbms,
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
      // ── Mixed-vendor select: AWS platform + AWS identity, Azure database. ──
      select: {
        'app-platform': Eks({}),
        idp: Cognito({}),
        // DB on Azure to demonstrate a cross-vendor LiveSystem; AwsRdsPostgresDbms
        // would keep the whole system on AWS.
        'app-dbms': AzurePostgresDbms({resourceGroup: 'rg-data'}),
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
