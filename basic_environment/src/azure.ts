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

// How the Azure cloud agent authenticates to Azure, selectable via env var:
//   - 'sp'   (default): a service principal (client id + secret) is passed to
//              deployEnvironment, which initializes the agent with the secret.
//   - 'oidc':  workload-identity federation — no SP secret. The sample mints a
//              short-lived OIDC token (e.g. the GitHub Actions id-token) and
//              passes it as the federated token; deployEnvironment forwards it as
//              the client assertion so the agent is initialized secretlessly.
const AGENT_AUTH = (
  process.env['AZURE_CLOUD_AGENT_AUTH'] ?? 'sp'
).toLowerCase();

// Control-plane credentials (same as any LiveSystem deploy).
const credentials = {
  clientId: process.env['SERVICE_ACCOUNT_ID']!,
  clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
};

// ── Operational environment: 'prod' — where LiveSystems land. ──
// It picks an Azure subscription; a default CI/CD deploy key and a secret are
// attached to show the full surface (both are optional).
let prod = OperationalEnvironment({
  shortName: 'prod',
  resourceGroups: [`Personal/${OWNER_ID}/prod-rg`],
}).withAzureSubscription({
  region: 'westeurope',
  subscriptionId: process.env['AZURE_OPERATIONAL_SUBSCRIPTION_ID'] ?? '',
});

// The CI/CD profile and the secret are OPTIONAL. Only attach them when a real
// value is supplied — the SDK rejects an empty secret value / ssh key, so
// attaching them with an empty-string fallback would fail validation.
const sshPrivateKeyData = process.env['SSH_PRIVATE_KEY'];
if (sshPrivateKeyData) {
  prod = prod.withDefaultCiCdProfile({
    shortName: 'default',
    displayName: 'Default deploy key',
    sshPrivateKeyData,
    sshPrivateKeyPassphrase: process.env['SSH_PASSPHRASE'],
  });
}
const dbPassword = process.env['DB_PASSWORD'];
if (dbPassword) {
  prod = prod.withSecret({
    shortName: 'db-password',
    displayName: 'Database password',
    value: dbPassword,
  });
}

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

// Mint a short-lived federated token for Azure workload-identity federation.
// In GitHub Actions with `permissions: id-token: write`, the runner exposes an
// OIDC token endpoint; we request a token whose audience is Azure AD's token
// exchange, then hand it to the SDK as the client assertion. No secret involved.
async function fetchAzureFederatedToken(): Promise<string> {
  const requestUrl = process.env['ACTIONS_ID_TOKEN_REQUEST_URL'];
  const requestToken = process.env['ACTIONS_ID_TOKEN_REQUEST_TOKEN'];
  if (!requestUrl || !requestToken) {
    throw new Error(
      'AZURE_CLOUD_AGENT_AUTH=oidc requires a GitHub Actions OIDC token ' +
        '(ACTIONS_ID_TOKEN_REQUEST_URL + ACTIONS_ID_TOKEN_REQUEST_TOKEN; set ' +
        '`permissions: id-token: write`).',
    );
  }
  const audience = 'api://AzureADTokenExchange';
  const res = await fetch(
    `${requestUrl}&audience=${encodeURIComponent(audience)}`,
    {headers: {Authorization: `Bearer ${requestToken}`}},
  );
  if (!res.ok) {
    throw new Error(
      `Failed to mint GitHub OIDC token: ${res.status} ${res.statusText}`,
    );
  }
  const body = (await res.json()) as {value: string};
  return body.value;
}

async function main() {
  // 1. Deploy the environment tree: create/update mgmt + operational envs, push
  //    secrets + CI/CD profiles, initialize cloud agents. `agentInit: 'wait'`
  //    blocks until each cloud-agent initialization completes (poll + step log).
  //    Provider credentials are passed explicitly (never read from process.env
  //    by the SDK). In 'sp' mode they are the SP client id + secret; in 'oidc'
  //    mode a (public) client id + a freshly-minted federated token, which the
  //    SDK forwards as the Azure client assertion — no secret leaves the runner.
  if (AGENT_AUTH === 'oidc') {
    const federatedToken = await fetchAzureFederatedToken();
    await deployEnvironment(management, credentials, {
      agentInit: 'wait',
      providerCredentials: {
        azure: {
          clientId: process.env['AZURE_SP_CLIENT_ID']!,
          federatedToken,
        },
      },
    });
  } else {
    await deployEnvironment(management, credentials, {
      agentInit: 'wait',
      providerCredentials: {
        azure: {
          spClientId: process.env['AZURE_SP_CLIENT_ID']!,
          spClientSecret: process.env['AZURE_SP_CLIENT_SECRET']!,
        },
      },
    });
  }

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
      [
        bc.ownerType ?? 'Personal',
        bc.ownerId ?? '',
        bc.name ?? '',
        liveSystem.name,
      ].join('/'),
  );
  await deploy(liveSystem, credentials, {
    mode: (process.env['DEPLOY_MODE'] as 'wait' | 'fire-and-forget') ?? 'wait',
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
