/**
 * azure_live_system.ts
 *
 * Satisfies the basic API management Fractal with Azure-specific components:
 *   - AzureApiManagement satisfies PaaSApiGateway
 *
 * Structural properties are all locked in the blueprint and carried over
 * automatically by satisfy(). Only Azure-specific parameters are set here.
 */

import {
  AzureApiManagement,
  Environment,
  KebabCaseString,
  LiveSystem,
  OwnerId,
  OwnerType,
} from '@fractal_cloud/sdk';
import {bcId, fractal, gateway} from './fractal';

export function getLiveSystem(): LiveSystem {
  // ── Azure API Management — satisfies PaaSApiGateway ────────────────────────

  const azureGateway = AzureApiManagement.satisfy(gateway.component)
    .withAzureRegion('westeurope')
    .withPublisherName('Platform Team')
    .withPublisherEmail('platform@example.com')
    .withSkuName('Developer_1')
    .build();

  // ── Live System ───────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-api-management-azure')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription('API Management on Azure — Azure API Management')
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
    .withComponent(azureGateway)
    .build();
}
