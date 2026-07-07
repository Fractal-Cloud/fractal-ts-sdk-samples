/**
 * azure.ts — initialize a Fractal Cloud Environment on Azure, then deploy a
 * LiveSystem into it. Fully self-contained; run:
 *
 *   npm run compile && node build/src/azure.js
 *
 * Two Environment tiers (see the SDK's environment surface):
 *   - MANAGEMENT env — owns the cloud AGENT (full identity: tenant + subscription)
 *     and the operational environments beneath it.
 *   - OPERATIONAL env ('prod') — declares a cloud ACCOUNT (a subscription); it is
 *     the governance scope a LiveSystem is deployed INTO. Its cloud-agent identity
 *     (tenant) is inherited from the management agent automatically.
 *
 * `deployEnvironment` create/updates both envs, pushes secrets + CI/CD profiles,
 * and initializes the cloud agents. Then a LiveSystem is deployed into the
 * operational env via `management.operational('prod').ref()`.
 */
import {authorFractal} from './fractal';
import {
  deploy,
  deployEnvironment,
  ManagementEnvironment,
  OperationalEnvironment,
  AzureBlob,
} from '@fractal_cloud/sdk/model';

const OWNER_ID = process.env['OWNER_ID'] ?? '';

// Control-plane credentials (same as any LiveSystem deploy).
const credentials = {
  clientId: process.env['SERVICE_ACCOUNT_ID']!,
  clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
};

// ── Operational environment: 'prod' — where LiveSystems land. ──
// It picks an Azure subscription; a default CI/CD deploy key and a secret are
// attached to show the full surface (both are optional).
const prod = OperationalEnvironment({
  shortName: 'prod',
  resourceGroups: [`Personal/${OWNER_ID}/prod-rg`],
})
  .withAzureSubscription({
    region: 'westeurope',
    subscriptionId: process.env['AZURE_OPERATIONAL_SUBSCRIPTION_ID'] ?? '',
  })
  .withDefaultCiCdProfile({
    shortName: 'default',
    displayName: 'Default deploy key',
    sshPrivateKeyData: process.env['SSH_PRIVATE_KEY'] ?? '',
    sshPrivateKeyPassphrase: process.env['SSH_PASSPHRASE'],
  })
  .withSecret({
    shortName: 'db-password',
    displayName: 'Database password',
    value: process.env['DB_PASSWORD'] ?? '',
  });

// ── Management environment: owns the cloud agent + the operational env. ──
// The cloud AGENT carries the full identity (tenant + a management subscription);
// the operational env's tenant is inherited from it at deploy time.
const management = ManagementEnvironment({
  id: {type: 'Personal', ownerId: OWNER_ID, shortName: 'mgmt'},
  resourceGroups: [`Personal/${OWNER_ID}/mgmt-rg`],
})
  .withAzureCloudAgent({
    region: 'westeurope',
    tenantId: process.env['AZURE_TENANT_ID'] ?? '',
    subscriptionId: process.env['AZURE_MANAGEMENT_SUBSCRIPTION_ID'] ?? '',
  })
  .withOperationalEnvironments([prod]);

async function main() {
  // 1. Deploy the environment tree: create/update mgmt + operational envs, push
  //    secrets + CI/CD profiles, initialize cloud agents. `agentInit: 'wait'`
  //    blocks until each cloud-agent initialization completes (poll + step log).
  //    Provider credentials are passed explicitly (never read from process.env
  //    by the SDK) and are sent as X-Azure-SP-* headers on the initializer call.
  await deployEnvironment(management, credentials, {
    agentInit: 'wait',
    providerCredentials: {
      azure: {
        spClientId: process.env['AZURE_SP_CLIENT_ID']!,
        spClientSecret: process.env['AZURE_SP_CLIENT_SECRET']!,
      },
    },
  });

  // 2. Deploy a LiveSystem INTO the operational environment. The binding is
  //    typo-proof: `management.operational('prod')` throws if there is no
  //    operational env named 'prod'. To target the MANAGEMENT env instead, use
  //    `management.ref()`.
  const liveSystem = authorFractal()
    .specialize()
    .toLiveSystem({
      name: 'acme-uploads',
      environment: management.operational('prod').ref(),
      select: {uploads: AzureBlob({accountTier: 'Standard_LRS'})},
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
