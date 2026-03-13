/**
 * gcp_live_system.ts
 *
 * Satisfies the basic API management Fractal with GCP-specific components:
 *   - GcpApiGateway satisfies PaaSApiGateway
 *
 * Structural properties are all locked in the blueprint and carried over
 * automatically by satisfy(). Only GCP-specific parameters are set here.
 */

import {
  Environment,
  GcpApiGateway,
  KebabCaseString,
  LiveSystem,
  OwnerId,
  OwnerType,
} from '@fractal_cloud/sdk';
import {bcId, fractal, gateway} from './fractal';

export function getLiveSystem(): LiveSystem {
  // ── GCP API Gateway — satisfies PaaSApiGateway ─────────────────────────────

  const gcpGateway = GcpApiGateway.satisfy(gateway.component)
    .withRegion('europe-west1')
    .withApiId('my-api')
    .build();

  // ── Live System ───────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-api-management-gcp')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription('API Management on GCP — GCP API Gateway')
    .withGenericProvider('GCP')
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
    .withComponent(gcpGateway)
    .build();
}
