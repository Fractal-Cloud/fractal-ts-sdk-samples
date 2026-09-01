/**
 * gcp.ts — run the Governed API Gateway Fractal on GCP.
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. Fully
 * self-contained; the ONLY cloud-specific code is the `select` map below.
 *   npm run compile && node build/src/gcp.js
 */
import {fatal} from './fatal';
import {authorFractal} from './fractal';
import {
  createFractalCloudClient,
  GcpApiGateway,
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
    // Application-level operations: the app declares the routes it exposes. The
    // architect's security guardrails (httpsOnly / rateLimit / cors) are locked
    // and untouchable here.
    .withRoute({
      path: '/orders',
      methods: ['GET', 'POST'],
      upstream: 'orders-svc',
    })
    .withRoute({path: '/users', methods: ['GET'], upstream: 'users-svc'})
    .toLiveSystem({
      name: 'basic-api-management',
      environment,
      // ── The ONLY cloud-specific lines: one offer per component. ──
      select: {
        'acme-apim-gateway': GcpApiGateway({}),
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
