/**
 * azure.ts — run the governed observability Fractal on Azure.
 *
 * COPY THIS FILE and azure_select.ts to adopt the Fractal on your cloud, then
 * run it. The ONLY cloud-specific code is the offer selection in
 * azure_select.ts, kept apart so a test can build the LiveSystem without
 * deploying it.
 *
 *   npm run compile && node build/src/azure.js
 */
import {fatal} from './fatal';
import {authorFractal} from './fractal';
import {azureSelect} from './azure_select';
import {createFractalCloudClient} from '@fractal_cloud/sdk/model';

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
    name: 'basic-observability',
    environment,
    // ── The ONLY cloud-specific lines: one offer per component. ──
    select: azureSelect(),
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
