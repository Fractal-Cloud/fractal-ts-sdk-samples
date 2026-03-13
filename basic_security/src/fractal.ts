/**
 * fractal.ts
 *
 * Defines a cloud-agnostic Fractal (blueprint) for Security:
 *
 *   ServiceMesh (service-mesh)
 *
 * The blueprint declares a single Service Mesh component.
 * No cloud-provider details appear here — the blueprint is satisfied
 * by Ocelot (CaaS) in the live system.
 */

import {
  BoundedContext,
  Fractal,
  KebabCaseString,
  OwnerId,
  OwnerType,
  ServiceMesh,
  Version,
} from '@fractal_cloud/sdk';

// ── Bounded Context ────────────────────────────────────────────────────────────

export const bcId = BoundedContext.Id.getBuilder()
  .withOwnerType(OwnerType.Personal)
  .withOwnerId(OwnerId.getBuilder().withValue(process.env['OWNER_ID']!).build())
  .withName(KebabCaseString.getBuilder().withValue('wizard').build())
  .build();

// ── Service Mesh ───────────────────────────────────────────────────────────────

export const serviceMesh = ServiceMesh.create({
  id: 'service-mesh',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Service Mesh',
});

// ── Fractal ────────────────────────────────────────────────────────────────────

export const fractal = Fractal.getBuilder()
  .withId(
    Fractal.Id.getBuilder()
      .withBoundedContextId(bcId)
      .withName(
        KebabCaseString.getBuilder().withValue('basic-security').build(),
      )
      .withVersion(
        Version.getBuilder().withMajor(1).withMinor(0).withPatch(0).build(),
      )
      .build(),
  )
  .withComponents([...serviceMesh.components])
  .build();
