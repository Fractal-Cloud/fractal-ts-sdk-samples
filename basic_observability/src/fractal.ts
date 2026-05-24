/**
 * fractal.ts
 *
 * Cloud-agnostic blueprint for a basic observability stack.
 * Declares three components: Monitoring, Tracing, and Logging.
 */

import {
  BoundedContext,
  Fractal,
  KebabCaseString,
  Logging,
  Monitoring,
  OwnerId,
  OwnerType,
  Tracing,
  Version,
} from '@fractal_cloud/sdk';

// ── Bounded Context ────────────────────────────────────────────────────────────

export const bcId = BoundedContext.Id.getBuilder()
  .withOwnerType(OwnerType.Personal)
  .withOwnerId(OwnerId.getBuilder().withValue(process.env['OWNER_ID']!).build())
  .withName(KebabCaseString.getBuilder().withValue(process.env['BC_NAME'] ?? 'wizard').build())
  .build();

// ── Blueprint components ─────────────────────────────────────────────────────

export const monitoring = Monitoring.create({
  id: 'monitoring',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Monitoring',
});

export const tracing = Tracing.create({
  id: 'tracing',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Tracing',
});

export const logging = Logging.create({
  id: 'logging',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Logging',
});

// ── Fractal ──────────────────────────────────────────────────────────────────

export const fractal = Fractal.getBuilder()
  .withId(
    Fractal.Id.getBuilder()
      .withBoundedContextId(bcId)
      .withName(
        KebabCaseString.getBuilder().withValue('basic-observability').build(),
      )
      .withVersion(
        Version.getBuilder().withMajor(1).withMinor(0).withPatch(0).build(),
      )
      .build(),
  )
  .withComponents([
    ...monitoring.components,
    ...tracing.components,
    ...logging.components,
  ])
  .build();
