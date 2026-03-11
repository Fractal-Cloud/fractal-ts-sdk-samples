/**
 * index.ts
 *
 * Entry point for the basic container platform sample.
 *
 * Select the target cloud provider at runtime via the CLOUD_PROVIDER environment
 * variable. Only the selected provider's live system is instantiated, so only
 * that provider's credentials and parameters need to be set.
 *
 * Supported values: aws (default) | azure | gcp
 *
 * Common environment variables (all providers):
 *   SERVICE_ACCOUNT_ID     – Fractal Cloud service account ID
 *   SERVICE_ACCOUNT_SECRET – Fractal Cloud service account secret
 *   OWNER_ID               – UUID of the Fractal Cloud owner
 *   ENVIRONMENT_NAME       – kebab-case environment name, e.g. "dev"
 *
 * AWS-specific:
 *   ECS_EXECUTION_ROLE_ARN – (optional) IAM execution role ARN for ECS tasks
 *   ECS_TASK_ROLE_ARN      – (optional) IAM task role ARN for the API workload
 *
 * Azure-specific:
 *   AZURE_LOCATION         – (optional) Azure region, default "westeurope"
 *   AZURE_RESOURCE_GROUP   – (optional) Azure resource group name, default "my-resource-group"
 *
 * GCP-specific:
 *   GCP_REGION             – (optional) GCP region, default "europe-west1"
 */

import {ServiceAccountCredentials, ServiceAccountId} from '@fractal_cloud/sdk';
import {fractal} from './fractal';
import {getLiveSystem as getAws} from './aws_live_system';
import {getLiveSystem as getAzure} from './azure_live_system';
import {getLiveSystem as getGcp} from './gcp_live_system';

const providers = {
  aws: getAws,
  azure: getAzure,
  gcp: getGcp,
} as const;

type ProviderKey = keyof typeof providers;

const providerKey = (process.env['CLOUD_PROVIDER'] ?? 'aws') as ProviderKey;

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
