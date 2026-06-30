/**
 * hetzner.ts — run the governed IaaS Fractal on Hetzner.
 *
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. It is fully
 * self-contained: it specializes the shared Fractal (fractal.ts), selects one
 * Hetzner offer per component, builds the LiveSystem, and deploys. This IaaS
 * pattern exposes no application-level operations, so `.specialize()` carries no
 * ops.
 *
 * The ONLY cloud-specific code is the `select` map below. To target a different
 * cloud, copy this file and swap those offers (see aws.ts / azure.ts / gcp.ts /
 * oci.ts).
 *
 *   npm run compile && node build/src/hetzner.js
 */
import {authorFractal} from './fractal';
import {
  deploy,
  HetznerNetwork,
  HetznerSubnet,
  HetznerFirewall,
  HetznerServer,
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
      // ── The ONLY cloud-specific lines: one Hetzner offer per component. ──
      select: {
        'main-network': HetznerNetwork({}),
        'public-subnet': HetznerSubnet({}),
        'web-sg': HetznerFirewall({}),
        'api-server': HetznerServer({serverType: 'cx22'}),
        'web-server': HetznerServer({serverType: 'cx22'}),
      },
    });

  await deploy(liveSystem, credentials, {mode: 'wait'});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
