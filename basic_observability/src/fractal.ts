/**
 * fractal.ts
 *
 * Cloud-agnostic blueprint for a basic observability stack.
 * Declares three components: Monitoring, Tracing, and Logging.
 */

import {
  Fractal,
  Monitoring,
  Tracing,
  Logging,
  BoundedContext,
  KebabCaseString,
} from 'fractal-ts-sdk';

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

export const fractal = Fractal.build({
  boundedContext: BoundedContext.build({
    id: KebabCaseString.getBuilder().withValue('observability-ctx').build(),
    name: 'Observability Context',
  }),
  id: KebabCaseString.getBuilder().withValue('basic-observability').build(),
  name: 'Basic Observability',
  description: 'A basic observability stack with monitoring, tracing, and logging',
  components: [
    ...monitoring.components,
    ...tracing.components,
    ...logging.components,
  ],
});
