/**
 * vmware_live_system.ts
 *
 * Satisfies the basic on-prem IaaS Fractal with VMware vSphere components:
 *   - VspherePortGroup  satisfies VirtualNetwork (distributed port group)
 *   - VsphereVlan       satisfies Subnet          (VLAN segment with gateway)
 *   - VsphereVm ×2      satisfies VirtualMachine   (vSphere template-based VMs)
 *
 * Structural properties — dependencies and links — are locked in the blueprint
 * and carried over automatically by satisfy(). Only vSphere-specific parameters
 * are set here.
 *
 * Environment variables:
 *   VSPHERE_DATACENTER    – vSphere datacenter name (default "dc1")
 *   VSPHERE_CLUSTER       – vSphere compute cluster name (default "cluster1")
 *   VSPHERE_DATASTORE     – Datastore for VM disks (default "datastore1")
 *   VSPHERE_DV_SWITCH     – Distributed virtual switch name (default "dvs-main")
 *   VSPHERE_TEMPLATE      – VM template name (default "ubuntu-22.04-template")
 *   VSPHERE_FOLDER        – (optional) VM folder path
 *   VSPHERE_RESOURCE_POOL – (optional) Resource pool name
 *   VSPHERE_SSH_PUBLIC_KEY – (optional) SSH public key for VM access
 */

import {
  Environment,
  KebabCaseString,
  LiveSystem,
  OwnerId,
  OwnerType,
  VspherePortGroup,
  VsphereVlan,
  VsphereVm,
} from '@fractal_cloud/sdk';
import {bcId, fractal} from './fractal';

// Retrieve blueprint components by ID
function bp(id: string) {
  const c = fractal.components.find(x => x.id.toString() === id);
  if (!c) throw new Error(`Blueprint component '${id}' not found`);
  return c;
}

export function getLiveSystem(): LiveSystem {
  const datacenter = process.env['VSPHERE_DATACENTER'] ?? 'dc1';
  const dvSwitchName = process.env['VSPHERE_DV_SWITCH'] ?? 'dvs-main';
  const cluster = process.env['VSPHERE_CLUSTER'] ?? 'cluster1';
  const datastore = process.env['VSPHERE_DATASTORE'] ?? 'datastore1';
  const template = process.env['VSPHERE_TEMPLATE'] ?? 'ubuntu-22.04-template';

  // ── Network ──────────────────────────────────────────────────────────────────

  const portGroup = VspherePortGroup.satisfy(bp('main-network'))
    .withName('main-network-pg')
    .withDvSwitchName(dvSwitchName)
    .withDatacenter(datacenter)
    .withVlanId(100)
    .withNumPorts(24)
    .withPortBinding('static')
    .build();

  const vlan = VsphereVlan.satisfy(bp('server-vlan'))
    .withName('server-vlan')
    .withVlanId(100)
    .withGateway('10.0.1.1')
    .withDvSwitchName(dvSwitchName)
    .withDatacenter(datacenter)
    .build();

  // ── VMs ───────────────────────────────────────────────────────────────────────

  const webBuilder = VsphereVm.satisfy(bp('web-server'))
    .withTemplate(template)
    .withDatacenter(datacenter)
    .withCluster(cluster)
    .withDatastore(datastore)
    .withNumCpus(2)
    .withMemoryMb(4096)
    .withDiskSizeGb(40)
    .withGuestId('ubuntu64Guest')
    .withHostname('web-server');
  if (process.env['VSPHERE_FOLDER'])
    webBuilder.withFolder(process.env['VSPHERE_FOLDER']);
  if (process.env['VSPHERE_RESOURCE_POOL'])
    webBuilder.withResourcePool(process.env['VSPHERE_RESOURCE_POOL']);
  if (process.env['VSPHERE_SSH_PUBLIC_KEY'])
    webBuilder.withSshPublicKey(process.env['VSPHERE_SSH_PUBLIC_KEY']);
  const vsphereWebServer = webBuilder.build();

  const apiBuilder = VsphereVm.satisfy(bp('api-server'))
    .withTemplate(template)
    .withDatacenter(datacenter)
    .withCluster(cluster)
    .withDatastore(datastore)
    .withNumCpus(4)
    .withMemoryMb(8192)
    .withDiskSizeGb(80)
    .withGuestId('ubuntu64Guest')
    .withHostname('api-server');
  if (process.env['VSPHERE_FOLDER'])
    apiBuilder.withFolder(process.env['VSPHERE_FOLDER']);
  if (process.env['VSPHERE_RESOURCE_POOL'])
    apiBuilder.withResourcePool(process.env['VSPHERE_RESOURCE_POOL']);
  if (process.env['VSPHERE_SSH_PUBLIC_KEY'])
    apiBuilder.withSshPublicKey(process.env['VSPHERE_SSH_PUBLIC_KEY']);
  const vsphereApiServer = apiBuilder.build();

  // ── Live System ───────────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder().withValue('basic-onprem-vmware').build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'Basic on-prem IaaS workload on VMware vSphere (Port Group + VLAN + 2 VMs)',
    )
    .withGenericProvider('VMware')
    .withEnvironment(
      Environment.getBuilder()
        .withId(
          Environment.Id.getBuilder()
            .withOwnerType(OwnerType.Personal)
            .withOwnerId(
              OwnerId.getBuilder().withValue(process.env['OWNER_ID']!).build(),
            )
            .withName(
              KebabCaseString.getBuilder()
                .withValue(process.env['ENVIRONMENT_NAME'] ?? 'dev')
                .build(),
            )
            .build(),
        )
        .build(),
    )
    .withComponent(portGroup)
    .withComponent(vlan)
    .withComponent(vsphereWebServer)
    .withComponent(vsphereApiServer)
    .build();
}
