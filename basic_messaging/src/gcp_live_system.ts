/**
 * gcp_live_system.ts
 *
 * Satisfies the basic messaging Fractal with GCP-specific components:
 *   - GcpPubSub        satisfies Broker
 *   - GcpPubSubTopic   satisfies MessagingEntity (x2)
 *
 * Structural properties — dependencies — are all locked in the blueprint
 * and carried over automatically by satisfy(). GCP Pub/Sub has no
 * additional vendor-specific parameters at the namespace level.
 *
 * Environment variables: (none required for GCP Pub/Sub)
 */

import {
  GcpPubSub,
  GcpPubSubTopic,
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
  // ── Pub/Sub — satisfies Broker ────────────────────────────────────────────

  const gcpBroker = GcpPubSub.satisfy(broker.broker).build();

  // ── Pub/Sub Topics — satisfies MessagingEntity ────────────────────────────
  // Broker dependency is auto-wired from the blueprint.

  const gcpOrdersTopic = GcpPubSubTopic.satisfy(bp('orders-topic')).build();

  const gcpNotificationsTopic = GcpPubSubTopic.satisfy(
    bp('notifications-topic'),
  ).build();

  // ── Live System ─────────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-messaging-gcp')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription('Messaging workload on GCP — Pub/Sub with topics')
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
    .withComponent(gcpBroker)
    .withComponent(gcpOrdersTopic)
    .withComponent(gcpNotificationsTopic)
    .build();
}
