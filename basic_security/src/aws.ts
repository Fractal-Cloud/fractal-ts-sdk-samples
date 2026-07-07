/**
 * aws.ts — run the governed security Fractal on AWS.
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. Fully
 * self-contained; the ONLY cloud-specific code is the `select` map below.
 *   npm run compile && node build/src/aws.js
 *
 * Offer selection is per-component, so a single LiveSystem can mix vendors and
 * delivery models freely. The compiler enforces that each selected offer
 * satisfies its component:
 *   - mesh: Ocelot (vendor-neutral self-hosted CaaS service mesh).
 *   - idp:  Cognito (AWS-managed identity provider).
 * Keycloak({}) — a vendor-neutral self-hosted CaaS identity provider — is also a
 * valid `idp` selection: a future-proof drop-in that satisfies the same
 * component with no change to the Fractal.
 */
import {authorFractal} from './fractal';
import {deploy, Ocelot, Cognito} from '@fractal_cloud/sdk/model';

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
    // Application-level operation: the app names its user directory.
    .withUserDirectory('acme')
    .toLiveSystem({
      name: 'basic-security',
      environment,
      select: {
        mesh: Ocelot({}),
        idp: Cognito({}),
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
