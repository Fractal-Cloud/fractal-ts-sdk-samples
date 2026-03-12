/**
 * fractal.ts
 *
 * Defines a cloud-agnostic Fractal (blueprint) for a messaging workload:
 *
 *   Broker (event-broker)
 *     ├── MessagingEntity (orders-topic)    — broker dep auto-wired
 *     └── MessagingEntity (notifications-topic) — broker dep auto-wired
 *
 * The blueprint declares a message broker with two topic entities.
 * No cloud-provider details appear here — the blueprint can be satisfied
 * by Azure (Service Bus) or GCP (Pub/Sub).
 */

import {
  BoundedContext,
  Broker,
  Fractal,
  KebabCaseString,
  MessagingEntity,
  OwnerId,
  OwnerType,
  Version,
} from '@fractal_cloud/sdk';

// ── Bounded Context ────────────────────────────────────────────────────────────

export const bcId = BoundedContext.Id.getBuilder()
  .withOwnerType(OwnerType.Personal)
  .withOwnerId(OwnerId.getBuilder().withValue(process.env['OWNER_ID']!).build())
  .withName(KebabCaseString.getBuilder().withValue('wizard').build())
  .build();

// ── Messaging Entities ─────────────────────────────────────────────────────────

const ordersTopic = MessagingEntity.create({
  id: 'orders-topic',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Orders Topic',
});

const notificationsTopic = MessagingEntity.create({
  id: 'notifications-topic',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Notifications Topic',
});

// ── Broker (entity deps auto-wired into each topic) ────────────────────────────

export const broker = Broker.create({
  id: 'event-broker',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Event Broker',
}).withEntities([ordersTopic, notificationsTopic]);

// ── Fractal ──────────────────────────────────────────────────────────────────

export const fractal = Fractal.getBuilder()
  .withId(
    Fractal.Id.getBuilder()
      .withBoundedContextId(bcId)
      .withName(
        KebabCaseString.getBuilder().withValue('basic-messaging').build(),
      )
      .withVersion(
        Version.getBuilder().withMajor(1).withMinor(0).withPatch(0).build(),
      )
      .build(),
  )
  .withComponents([
    broker.broker,
    ...broker.entities.map(e => e.component),
  ])
  .build();
