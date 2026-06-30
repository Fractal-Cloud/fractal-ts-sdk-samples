/**
 * azure.ts — run the governed IaaS Fractal on Azure.
 *
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. It is fully
 * self-contained: it specializes the shared Fractal (fractal.ts), selects one
 * Azure offer per component, builds the LiveSystem, and deploys. This IaaS
 * pattern exposes no application-level operations, so `.specialize()` carries no
 * ops.
 *
 * The ONLY cloud-specific code is the `select` map below. To target a different
 * cloud, copy this file and swap those offers (see aws.ts / gcp.ts / oci.ts /
 * hetzner.ts).
 *
 *   npm run compile && node build/src/azure.js
 */
import {authorFractal} from './fractal';
import {
  deploy,
  AzureVnet,
  AzureSubnet,
  AzureNsg,
  AzureVm,
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
      // ── The ONLY cloud-specific lines: one Azure offer per component. ──
      select: {
        'main-network': AzureVnet({}),
        'public-subnet': AzureSubnet({}),
        'web-sg': AzureNsg({location: 'westeurope', resourceGroup: 'rg-iaas'}),
        'api-server': AzureVm({vmSize: 'Standard_B1s'}),
        'web-server': AzureVm({vmSize: 'Standard_B1s'}),
      },
    });

  await deploy(liveSystem, credentials, {mode: 'wait'});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
