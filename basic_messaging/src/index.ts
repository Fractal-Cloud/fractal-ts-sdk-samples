/**
 * index.ts
 *
 * Entry point for the basic messaging sample.
 *
 * Select the target cloud provider at runtime via the CLOUD_PROVIDER environment
 * variable. Only the selected provider's live system is instantiated, so only
 * that provider's credentials and parameters need to be set.
 *
 * Supported values: azure (default) | gcp
 *
 * Common environment variables (all providers):
 *   SERVICE_ACCOUNT_ID     – Fractal Cloud service account ID
 *   SERVICE_ACCOUNT_SECRET – Fractal Cloud service account secret
 *   OWNER_ID               – UUID of the Fractal Cloud owner
 *   ENVIRONMENT_NAME       – kebab-case environment name, e.g. "dev"
 *
 * Azure-specific:
 *   AZURE_LOCATION         – (optional) Azure region, default "westeurope"
 *   AZURE_RESOURCE_GROUP   – (optional) Azure resource group name, default "my-resource-group"
 *   AZURE_SERVICE_BUS_SKU  – (optional) Service Bus SKU, default "Standard"
 *
 * GCP-specific:
 *   (no additional env vars required)
 */

import {ServiceAccountCredentials, ServiceAccountId} from '@fractal_cloud/sdk';
import {fractal} from './fractal';
import {getLiveSystem as getAzure} from './azure_live_system';
import {getLiveSystem as getGcp} from './gcp_live_system';

const providers = {
  azure: getAzure,
  gcp: getGcp,
} as const;

type ProviderKey = keyof typeof providers;

const providerKey = (process.env['CLOUD_PROVIDER'] ?? 'azure') as ProviderKey;

if (!(providerKey in providers)) {
  console.error(
    `Unknown CLOUD_PROVIDER "${providerKey}". Valid values: ${Object.keys(providers).join(', ')}`,
  );
  process.exit(1);
}

const credentials = ServiceAccountCredentials.getBuilder()
  .withId(
    ServiceAccountId.getBuilder()
      .withValue(process.env['SERVICE_ACCOUNT_ID']!)
      .build(),
  )
  .withSecret(process.env['SERVICE_ACCOUNT_SECRET']!)
  .build();

const liveSystem = providers[providerKey]();

fractal.deploy(credentials).catch(console.error);
liveSystem.deploy(credentials).catch(console.error);
