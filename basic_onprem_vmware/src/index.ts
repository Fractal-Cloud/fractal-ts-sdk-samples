/**
 * index.ts
 *
 * Entry point for the basic on-prem VMware sample.
 *
 * Deploys a Fractal (cloud-agnostic blueprint) and a VMware vSphere Live System
 * to the Fractal Cloud API in fire-and-forget mode.
 *
 * Environment variables:
 *   SERVICE_ACCOUNT_ID     – Fractal Cloud service account ID
 *   SERVICE_ACCOUNT_SECRET – Fractal Cloud service account secret
 *   OWNER_ID               – UUID of the Fractal Cloud owner
 *   ENVIRONMENT_NAME       – kebab-case environment name, e.g. "dev"
 *   VSPHERE_DATACENTER     – vSphere datacenter name (default "dc1")
 *   VSPHERE_CLUSTER        – vSphere compute cluster name (default "cluster1")
 *   VSPHERE_DATASTORE      – Datastore for VM disks (default "datastore1")
 *   VSPHERE_DV_SWITCH      – Distributed virtual switch name (default "dvs-main")
 *   VSPHERE_TEMPLATE       – VM template name (default "ubuntu-22.04-template")
 *   VSPHERE_FOLDER         – (optional) VM folder path
 *   VSPHERE_RESOURCE_POOL  – (optional) Resource pool name
 *   VSPHERE_SSH_PUBLIC_KEY – (optional) SSH public key for VM access
 */

import {ServiceAccountCredentials, ServiceAccountId} from '@fractal_cloud/sdk';
import {fractal} from './fractal';
import {getLiveSystem} from './vmware_live_system';

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
