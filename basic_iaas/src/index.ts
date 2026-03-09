/**
 * index.ts
 *
 * Entry point for the basic IaaS sample.
 *
 * Select the target cloud provider at runtime via the CLOUD_PROVIDER environment
 * variable. Only the selected provider's live system is instantiated, so only
 * that provider's credentials and parameters need to be set.
 *
 * Supported values: aws (default) | azure | gcp | oci | hetzner
 *
 * Common environment variables (all providers):
 *   SERVICE_ACCOUNT_ID     – Fractal Cloud service account ID
 *   SERVICE_ACCOUNT_SECRET – Fractal Cloud service account secret
 *   OWNER_ID               – UUID of the Fractal Cloud owner
 *   ENVIRONMENT_NAME       – kebab-case environment name, e.g. "dev"
 *
 * AWS-specific:
 *   EC2_KEY_NAME           – (optional) EC2 key pair name for SSH access
 *
 * Azure-specific:
 *   AZURE_RESOURCE_GROUP   – Azure resource group name
 *   AZURE_LOCATION         – (optional) Azure region, default "westeurope"
 *   AZURE_VM_SIZE          – (optional) VM size, default "Standard_B1s"
 *   AZURE_ADMIN_USERNAME   – (optional) VM admin username, default "azureuser"
 *
 * GCP-specific:
 *   GCP_REGION             – (optional) GCP region, default "europe-west1"
 *   GCP_ZONE               – (optional) GCP zone, default "europe-west1-b"
 *   GCP_MACHINE_TYPE       – (optional) machine type, default "e2-micro"
 *
 * OCI-specific:
 *   OCI_COMPARTMENT_ID     – OCI compartment OCID
 *   OCI_IMAGE_ID           – OCI image OCID
 *   OCI_AVAILABILITY_DOMAIN – (optional) availability domain, default "AD-1"
 *   OCI_SHAPE              – (optional) compute shape, default "VM.Standard.E4.Flex"
 *
 * Hetzner-specific:
 *   HETZNER_NETWORK_ZONE   – (optional) network zone, default "eu-central"
 *   HETZNER_SERVER_TYPE    – (optional) server type, default "cx22"
 *   HETZNER_LOCATION       – (optional) datacenter location, default "nbg1"
 *   HETZNER_IMAGE          – (optional) OS image, default "ubuntu-24.04"
 */

import {ServiceAccountCredentials, ServiceAccountId} from '@fractal_cloud/sdk';
import {fractal} from './fractal';
import {getLiveSystem as getAws} from './aws_live_system';
import {getLiveSystem as getAzure} from './azure_live_system';
import {getLiveSystem as getGcp} from './gcp_live_system';
import {getLiveSystem as getOci} from './oci_live_system';
import {getLiveSystem as getHetzner} from './hetzner_live_system';

const providers = {
  aws: getAws,
  azure: getAzure,
  gcp: getGcp,
  oci: getOci,
  hetzner: getHetzner,
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
