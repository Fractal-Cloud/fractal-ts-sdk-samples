/**
 * oci.ts — run the governed IaaS Fractal on OCI.
 *
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. It is fully
 * self-contained: it specializes the shared Fractal (fractal.ts), selects one
 * OCI offer per component, builds the LiveSystem, and deploys. This IaaS pattern
 * exposes no application-level operations, so `.specialize()` carries no ops.
 *
 * The ONLY cloud-specific code is the `select` map below. To target a different
 * cloud, copy this file and swap those offers (see aws.ts / azure.ts / gcp.ts /
 * hetzner.ts).
 *
 *   npm run compile && node build/src/oci.js
 */
import {authorFractal} from './fractal';
import {
  deploy,
  OciVcn,
  OciSubnet,
  OciSecurityList,
  OciInstance,
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
    .toLiveSystem({
      name: 'basic-iaas',
      environment,
      // ── The ONLY cloud-specific lines: one OCI offer per component. ──
      select: {
        'main-network': OciVcn({}),
        'public-subnet': OciSubnet({}),
        'web-sg': OciSecurityList({
          compartmentId: process.env['OCI_COMPARTMENT_ID'] ?? '',
        }),
        'api-server': OciInstance({shape: 'VM.Standard.E4.Flex'}),
        'web-server': OciInstance({shape: 'VM.Standard.E4.Flex'}),
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
