/**
 * fractal.ts
 *
 * Defines a cloud-agnostic Fractal (blueprint) for API Management:
 *
 *   PaaSApiGateway (api-gateway)
 *
 * The blueprint declares a single API Gateway component.
 * No cloud-provider details appear here — the blueprint can be satisfied
 * by AWS CloudFront, Azure API Management, or GCP API Gateway.
 */

import {
  BoundedContext,
  Fractal,
  KebabCaseString,
  OwnerId,
  OwnerType,
  PaaSApiGateway,
  Version,
} from '@fractal_cloud/sdk';

// ── Bounded Context ────────────────────────────────────────────────────────────

export const bcId = BoundedContext.Id.getBuilder()
  .withOwnerType(OwnerType.Personal)
  .withOwnerId(OwnerId.getBuilder().withValue(process.env['OWNER_ID']!).build())
  .withName(KebabCaseString.getBuilder().withValue('wizard').build())
  .build();

// ── API Gateway ────────────────────────────────────────────────────────────────

export const gateway = PaaSApiGateway.create({
  id: 'api-gateway',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'API Gateway',
});

// ── Fractal ────────────────────────────────────────────────────────────────────

export const fractal = Fractal.getBuilder()
  .withId(
    Fractal.Id.getBuilder()
      .withBoundedContextId(bcId)
      .withName(
        KebabCaseString.getBuilder()
          .withValue('basic-api-management')
          .build(),
      )
      .withVersion(
        Version.getBuilder().withMajor(1).withMinor(0).withPatch(0).build(),
      )
      .build(),
  )
  .withComponents([...gateway.components])
  .build();
