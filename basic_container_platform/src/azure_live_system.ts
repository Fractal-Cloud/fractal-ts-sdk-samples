/**
 * azure_live_system.ts
 *
 * Satisfies the basic container platform Fractal with Azure-specific components:
 *   - AzureVnet                        satisfies VirtualNetwork
 *   - AzureSubnet                      satisfies Subnet
 *   - AzureNsg                         satisfies SecurityGroup (ingress rules from blueprint)
 *   - AzureContainerAppsEnvironment    satisfies ContainerPlatform
 *   - AzureContainerApp (web-workload) satisfies Workload (containerImage, port, cpu, memory from blueprint)
 *   - AzureContainerApp (api-workload) satisfies Workload (containerImage, port, cpu, memory from blueprint)
 *
 * Structural properties — dependencies, links, containerImage, containerPort,
 * cpu, memory, desiredCount, ingressRules — are all locked in the blueprint
 * and carried over automatically by satisfy(). Only Azure-specific parameters
 * are set here.
 *
 * Environment variables:
 *   AZURE_LOCATION        – (optional) Azure region, default "westeurope"
 *   AZURE_RESOURCE_GROUP  – (optional) Azure resource group name, default "my-resource-group"
 */

import {
  AzureContainerApp,
  AzureContainerAppsEnvironment,
  AzureNsg,
  AzureSubnet,
  AzureVnet,
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
  const location = process.env['AZURE_LOCATION'] ?? 'westeurope';
  const resourceGroup =
    process.env['AZURE_RESOURCE_GROUP'] ?? 'my-resource-group';

  // ── Network ──────────────────────────────────────────────────────────────────

  const azureVnet = AzureVnet.satisfy(bp('main-network'))
    .withLocation(location)
    .withResourceGroup(resourceGroup)
    .build();

  const azureSubnet = AzureSubnet.satisfy(bp('private-subnet'))
    .withResourceGroup(resourceGroup)
    .build();

  // Ingress rules (port 80 + port 8080) are carried from the blueprint automatically
  const azureNsg = AzureNsg.satisfy(bp('app-sg'))
    .withLocation(location)
    .withResourceGroup(resourceGroup)
    .build();

  // ── Container Apps Environment — satisfies the blueprint ContainerPlatform ──

  const azureEnv = AzureContainerAppsEnvironment.satisfy(bp('app-cluster'))
    .withLocation(location)
    .withResourceGroup(resourceGroup)
    .build();

  // ── Container Apps — satisfy Workload blueprints ──────────────────────────
  // containerImage → image, containerPort → port, cpu, memory, dependencies,
  // and links are all carried from the blueprint automatically.

  const azureWebApp = AzureContainerApp.satisfy(bp('web-workload'))
    .withLocation(location)
    .withResourceGroup(resourceGroup)
    .withExternalIngress(true)
    .build();

  const azureApiApp = AzureContainerApp.satisfy(bp('api-workload'))
    .withLocation(location)
    .withResourceGroup(resourceGroup)
    .withExternalIngress(false)
    .build();

  // ── Live System ───────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-container-platform-azure')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'Two-tier container workload on Azure Container Apps (VNet + Subnet + NSG + Container Apps Environment + 2 Workloads)',
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
    .withComponent(azureEnv)
    .withComponent(azureWebApp)
    .withComponent(azureApiApp)
    .build();
}
