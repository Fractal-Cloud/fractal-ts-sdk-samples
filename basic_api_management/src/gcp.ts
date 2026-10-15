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

// GCP API Gateway serves an API config, the OpenAPI 2.0 document of the API.
// The agent requires it; the routes the gateway serves are the paths below.
const apiConfig = `swagger: '2.0'
info:
  title: basic-api-management
  version: 1.0.0
paths:
  /orders:
    get:
      operationId: listOrders
      responses:
        '200':
          description: OK
    post:
      operationId: createOrder
      responses:
        '200':
          description: OK
  /users:
    get:
      operationId: listUsers
      responses:
        '200':
          description: OK
`;

async function main() {
  const fractal = authorFractal();
  const liveSystem = fractal.specialize().toLiveSystem({
    name: 'basic-api-management',
    environment,
    // ── The ONLY cloud-specific lines: one offer per component. ──
    select: {
      'acme-apim-gateway': GcpApiGateway({apiConfig}),
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
