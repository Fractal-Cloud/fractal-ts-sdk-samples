/**
 * index.ts
 *
 * Entry point for the basic on-prem OpenShift sample.
 *
 * Deploys a Fractal (cloud-agnostic blueprint) and an OpenShift Live System
 * to the Fractal Cloud API in fire-and-forget mode.
 *
 * Environment variables:
 *   SERVICE_ACCOUNT_ID       – Fractal Cloud service account ID
 *   SERVICE_ACCOUNT_SECRET   – Fractal Cloud service account secret
 *   OWNER_ID                 – UUID of the Fractal Cloud owner
 *   ENVIRONMENT_NAME         – kebab-case environment name, e.g. "dev"
 *   OPENSHIFT_NAMESPACE      – Kubernetes namespace (default "app")
 *   OPENSHIFT_STORAGE_CLASS  – StorageClass name (default "gp3-csi")
 *   OPENSHIFT_ROUTE_HOSTNAME – (optional) Route hostname for the web service
 *   OPENSHIFT_VM_IMAGE       – (optional) VM base image for OpenShift Virtualization
 *   OPENSHIFT_SSH_PUBLIC_KEY – (optional) SSH public key for VM access
 */

import {ServiceAccountCredentials, ServiceAccountId} from '@fractal_cloud/sdk';
import {fractal} from './fractal';
import {getLiveSystem} from './openshift_live_system';

const credentials = ServiceAccountCredentials.getBuilder()
  .withId(
    ServiceAccountId.getBuilder()
      .withValue(process.env['SERVICE_ACCOUNT_ID']!)
      .build(),
  )
  .withSecret(process.env['SERVICE_ACCOUNT_SECRET']!)
  .build();

const liveSystem = getLiveSystem();

async function main() {
  await fractal.deploy(credentials);
  await liveSystem.deploy(credentials);
  if (process.env['FRACTAL_RESULT_PATH']) {
    const {writeFileSync} = await import('fs');
    writeFileSync(
      process.env['FRACTAL_RESULT_PATH']!,
      JSON.stringify({liveSystemId: liveSystem.id.toString(), components: []}) + '\n',
    );
  }
}

main().catch(console.error);
