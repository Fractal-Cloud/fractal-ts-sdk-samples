/**
 * caas_live_system.ts
 *
 * Satisfies the basic Security Fractal with CaaS-specific components:
 *   - Ocelot satisfies ServiceMesh
 *
 * Structural properties are all locked in the blueprint and carried over
 * automatically by satisfy(). Only CaaS-specific parameters are set here.
 */

import {
  Environment,
  KebabCaseString,
  LiveSystem,
  Ocelot,
  OwnerId,
  OwnerType,
} from '@fractal_cloud/sdk';
import {bcId, fractal, serviceMesh} from './fractal';

export function getLiveSystem(): LiveSystem {
  // ── Ocelot — satisfies ServiceMesh ──────────────────────────────────────────

  const ocelot = Ocelot.satisfy(serviceMesh.component)
    .withNamespace('ocelot')
    .withHost('app.example.com')
    .withHostOwnerEmail('admin@example.com')
    .withCorsOrigins('https://app.example.com')
    .withCookieMaxAgeSec(3600)
    .build();

  // ── Live System ─────────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-security-caas')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription('Security on CaaS — Ocelot Service Mesh')
    .withGenericProvider('CaaS')
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
    .withComponent(ocelot)
    .build();
}
