/**
 * azure.ts — run the app Fractal fully on Azure.
 *
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it:
 *   npm run compile && node build/src/azure.js
 *
 * The ONLY cloud-specific code is the `select` map below:
 *   - app-platform: Aks               (managed Kubernetes; workloads run on it)
 *   - idp:          EntraExternalId    (Microsoft Entra External ID — the Azure IdP)
 *   - app-dbms:     AzurePostgresDbms  (managed PostgreSQL; the DB child follows it)
 *
 * The workload itself is NOT selected here — it is added by the
 * `withStatefulService` operation and emitted by the platform offer (Aks) in its
 * own family. Swapping the IdP to AWS is a one-line change (see mixed.ts, which
 * selects Cognito) — the Fractal itself never changes.
 */
import {authorFractal} from './fractal';
import {
  deploy,
  Aks,
  EntraExternalId,
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
      // ── The ONLY cloud-specific lines: one Azure offer per component. ──
      select: {
        'app-platform': Aks({}),
        idp: EntraExternalId({
          tenantName: 'acmeexternal',
          resourceGroup: 'rg-identity',
        }),
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
