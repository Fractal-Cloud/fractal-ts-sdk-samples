/**
 * azure_live_system.ts
 *
 * Satisfies the basic IaaS Fractal with Azure-specific components:
 *   - AzureVnet         satisfies VirtualNetwork
 *   - AzureSubnet       satisfies Subnet  (adds resource group)
 *   - AzureNsg          satisfies SecurityGroup (ingress rules from blueprint)
 *   - AzureVm           satisfies VirtualMachine (adds VM size, image, admin credentials)
 *
 * All structural decisions (dependencies, links, security rules) are locked
 * in the blueprint. Only Azure-specific parameters are set here.
 */

import {
  AzureVnet,
  AzureSubnet,
  AzureNsg,
  AzureVm,
  Environment,
  KebabCaseString,
  LiveSystem,
  OwnerId,
  OwnerType,
} from '@fractal_cloud/sdk';
import {bcId, fractal} from './fractal';

// Retrieve blueprint components by ID
function bp(id: string) {
  const c = fractal.components.find(x => x.id.toString() === id);
  if (!c) throw new Error(`Blueprint component '${id}' not found`);
  return c;
}

export function getLiveSystem(): LiveSystem {
  // ── Azure components ───────────────────────────────────────────────────────────

  const azureVnet = AzureVnet.satisfy(bp('main-network'))
    .withLocation(process.env['AZURE_LOCATION'] ?? 'westeurope')
    .withResourceGroup(process.env['AZURE_RESOURCE_GROUP']!)
    .build();

  const azureSubnet = AzureSubnet.satisfy(bp('public-subnet'))
    .withResourceGroup(process.env['AZURE_RESOURCE_GROUP']!)
    .build();

  const azureNsg = AzureNsg.satisfy(bp('web-sg'))
    .withLocation(process.env['AZURE_LOCATION'] ?? 'westeurope')
    .withResourceGroup(process.env['AZURE_RESOURCE_GROUP']!)
    .build();

  const azureWebVm = AzureVm.satisfy(bp('web-server'))
    .withVmSize(process.env['AZURE_VM_SIZE'] ?? 'Standard_B1s')
    .withLocation(process.env['AZURE_LOCATION'] ?? 'westeurope')
    .withResourceGroup(process.env['AZURE_RESOURCE_GROUP']!)
    .withAdminUsername(process.env['AZURE_ADMIN_USERNAME'] ?? 'azureuser')
    .withImagePublisher('Canonical')
    .withImageOffer('0001-com-ubuntu-server-jammy')
    .withImageSku('22_04-lts-gen2')
    .build();

  const azureApiVm = AzureVm.satisfy(bp('api-server'))
    .withVmSize(process.env['AZURE_VM_SIZE'] ?? 'Standard_B1s')
    .withLocation(process.env['AZURE_LOCATION'] ?? 'westeurope')
    .withResourceGroup(process.env['AZURE_RESOURCE_GROUP']!)
    .withAdminUsername(process.env['AZURE_ADMIN_USERNAME'] ?? 'azureuser')
    .withImagePublisher('Canonical')
    .withImageOffer('0001-com-ubuntu-server-jammy')
    .withImageSku('22_04-lts-gen2')
    .build();

  // ── Live System ────────────────────────────────────────────────────────────────

  const liveSystem = LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder().withValue('basic-iaas-azure').build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'Basic IaaS workload deployed on Azure (VNet + Subnet + NSG + VMs)',
    )
    .withGenericProvider('Azure')
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
    .withComponent(azureVnet)
    .withComponent(azureSubnet)
    .withComponent(azureNsg)
    .withComponent(azureWebVm)
    .withComponent(azureApiVm)
    .build();

  return liveSystem;
}
