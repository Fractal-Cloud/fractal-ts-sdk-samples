/**
 * index.ts — the DEV team consumes the governed Fractal.
 *
 * The dev never authors infrastructure: they (1) specialize the Fractal through
 * its typed Interface (the dev-open ops only — guardrails are locked), then
 * (2) build a LiveSystem by SELECTING one concrete offer for the gateway from
 * the open Catalogue. Selection is the ONLY place a vendor is named.
 *
 * The dev's specialization is purely APPLICATION-level: it declares the routes
 * the app exposes via `withRoute(...)`. It cannot touch the architect's locked
 * security guardrails (httpsOnly / rateLimit / cors) — those came baked into the
 * authored Fractal.
 */
import {authorFractal} from './fractal';
import {
  deploy,
  AwsCloudFront,
  AzureApiManagement,
  GcpApiGateway,
  // FUTURE-PROOF / vendor-neutral: the same `api-gateway` component can also be
  // satisfied by a self-hosted CaaS offer with NO cloud provider, e.g.
  //   Ambassador({}) or Traefik({})
  // Swap the selection below to one of these to run the SAME governed Fractal on
  // any Kubernetes cluster, vendor-neutral. (Imported for illustration.)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Ambassador,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Traefik,
} from '@fractal_cloud/sdk/model';

const environment = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['ENVIRONMENT_NAME'] ?? 'dev',
};

// Single-component offer selection, switched on CLOUD_PROVIDER. Swap any branch
// to change vendor — the Fractal is untouched. A self-hosted, vendor-neutral
// CaaS offer (Ambassador({}) / Traefik({})) is an equally valid selection here.
function selectionFor(provider: 'aws' | 'azure' | 'gcp') {
  switch (provider) {
    case 'azure':
      return {
        'api-gateway': AzureApiManagement({
          publisherEmail: 'ops@acme.com',
          sku: 'Developer',
        }),
      };
    case 'gcp':
      return {'api-gateway': GcpApiGateway({})};
    case 'aws':
    default:
      return {'api-gateway': AwsCloudFront({region: 'us-east-1'})};
  }
}

async function main() {
  const provider = (process.env['CLOUD_PROVIDER'] ?? 'aws') as
    | 'aws'
    | 'azure'
    | 'gcp';

  // 1. Specialize through the Interface (dev-open ops only). Immutable: the
  //    authored Fractal is never mutated, so it stays reusable.
  // 2. Build the LiveSystem by selecting the gateway offer for the provider.
  const liveSystem = authorFractal()
    .specialize()
    // Application-level operations: the app declares the routes it exposes. The
    // architect's security guardrails (httpsOnly / rateLimit / cors) are locked
    // and untouchable here.
    .withRoute({path: '/orders', methods: ['GET', 'POST'], upstream: 'orders-svc'})
    .withRoute({path: '/users', methods: ['GET'], upstream: 'users-svc'})
    .toLiveSystem({
      name: 'basic-api-management',
      environment,
      select: selectionFor(provider),
    });

  // 3. Deploy: submit the LiveSystem and wait until Active (wait-mode logs).
  await deploy(
    liveSystem,
    {
      clientId: process.env['SERVICE_ACCOUNT_ID']!,
      clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
    },
    {mode: 'wait'},
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
