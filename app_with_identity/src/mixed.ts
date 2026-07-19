/**
 * mixed.ts — the same app Fractal as a single MIXED-vendor LiveSystem.
 *
 *   npm run compile && node build/src/mixed.js
 *
 * This is the "ECS + Cognito + database" shape: the workload runs on AWS ECS and
 * authenticates against AWS Cognito, while the relational database is on Azure.
 * Offer selection is per-component, so one LiveSystem may span vendors freely —
 * the compiler still checks each offer satisfies its component, and the Fractal
 * (fractal.ts) is untouched.
 *
 * Why the DB is on Azure: the catalogue has no AWS-managed relational offer yet
 * (only Azure/GCP/Aruba satisfy Storage.RelationalDbms). Add an AWS RDS offer to
 * the SDK later and this line becomes a one-word swap — the Fractal never changes.
 */
import {authorFractal} from './fractal';
import {
  deploy,
  EcsService,
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

async function main() {
  const liveSystem = authorFractal()
    .specialize()
    .withWebImage('acme/web:1.4.0')
    .withUserDirectory('acme')
    .withDatabases(['orders'])
    .toLiveSystem({
      name: 'acme-app',
      environment,
      // ── Mixed-vendor select: AWS workload + AWS identity, Azure database. ──
      select: {
        app: EcsService({launchType: 'FARGATE'}),
        idp: Cognito({}),
        // DB on Azure: the SDK has no AWS managed relational offer yet, so the
        // relational tier runs on Azure in this mixed-vendor LiveSystem.
        'app-dbms': AzurePostgresDbms({resourceGroup: 'rg-data'}),
      },
    });

  const bc = liveSystem.boundedContext;
  console.log(
    'LIVE_SYSTEM_ID=' +
      [bc.ownerType ?? 'Personal', bc.ownerId ?? '', bc.name ?? '', liveSystem.name].join('/')
  );
  await deploy(liveSystem, credentials, {
    mode: (process.env['DEPLOY_MODE'] as 'wait' | 'fire-and-forget') ?? 'wait',
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
