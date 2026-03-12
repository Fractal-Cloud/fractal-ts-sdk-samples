/**
 * azure_live_system.ts
 *
 * Satisfies the basic messaging Fractal with Azure-specific components:
 *   - AzureServiceBus        satisfies Broker
 *   - AzureServiceBusTopic   satisfies MessagingEntity (x2)
 *
 * Structural properties — dependencies — are all locked in the blueprint
 * and carried over automatically by satisfy(). Only Azure-specific
 * parameters are set here.
 *
 * Environment variables:
 *   AZURE_LOCATION        – (optional) Azure region, default "westeurope"
 *   AZURE_RESOURCE_GROUP  – (optional) Azure resource group name, default "my-resource-group"
 *   AZURE_SERVICE_BUS_SKU – (optional) Service Bus SKU, default "Standard"
 */

import {
  AzureServiceBus,
  AzureServiceBusTopic,
  Environment,
  KebabCaseString,
  LiveSystem,
  OwnerId,
  OwnerType,
} from '@fractal_cloud/sdk';
import {bcId, fractal, broker} from './fractal';

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
  const sku = process.env['AZURE_SERVICE_BUS_SKU'] ?? 'Standard';

  // ── Service Bus — satisfies Broker ────────────────────────────────────────

  const azureBroker = AzureServiceBus.satisfy(broker.broker)
    .withAzureRegion(location)
    .withAzureResourceGroup(resourceGroup)
    .withSku(sku)
    .build();

  // ── Service Bus Topics — satisfies MessagingEntity ────────────────────────
  // Broker dependency is auto-wired from the blueprint.

  const azureOrdersTopic = AzureServiceBusTopic.satisfy(bp('orders-topic'))
    .withAzureRegion(location)
    .withAzureResourceGroup(resourceGroup)
    .build();

  const azureNotificationsTopic = AzureServiceBusTopic.satisfy(
    bp('notifications-topic'),
  )
    .withAzureRegion(location)
    .withAzureResourceGroup(resourceGroup)
    .build();

  // ── Live System ─────────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-messaging-azure')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'Messaging workload on Azure — Service Bus namespace with topics',
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
    .withComponent(azureBroker)
    .withComponent(azureOrdersTopic)
    .withComponent(azureNotificationsTopic)
    .build();
}
