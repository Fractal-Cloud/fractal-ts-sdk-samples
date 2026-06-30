/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * This is a vendor-AGNOSTIC Fractal: the blueprint references only abstract
 * Components (Messaging.Broker, Messaging.MessagingEntity). It NEVER names a
 * vendor or an offer — those are chosen later, per component, when a LiveSystem
 * is built (see index.ts). Add a new vendor to the catalogue tomorrow and this
 * Fractal supports it unchanged.
 *
 * Two kinds of specialization can live here:
 *   - GUARDRAILS — the architect calls `.withXxx()` at design time. The value is
 *     LOCKED: a consuming dev cannot override it. These are infra PARAMETERS
 *     (message retention, partition count, dead-lettering, encryption, ...).
 *   - OPERATIONS — the typed Interface a consuming dev uses. These are
 *     APPLICATION-level verbs (what the app decides), NOT pass-through setters
 *     for infra knobs. This sample exposes NO operations: the messaging topology
 *     (one broker, two governed topics) is fully fixed by the architect, leaving
 *     nothing app-meaningful for a dev to customize. Add operations later only
 *     if a genuine application-domain choice emerges.
 *
 * Imported from the locked model surface: '@fractal_cloud/sdk/model'.
 */
import {createFractal, Broker, MessagingEntity} from '@fractal_cloud/sdk/model';

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'wizard',
};

/**
 * Author the "governed messaging" Fractal. Returns a reusable, immutable
 * Fractal: `.specialize()` never mutates it, so it is safe to author once and
 * instantiate many times (see index.ts).
 */
export function authorFractal() {
  return createFractal({
    id: 'basic-messaging',
    version: {major: 1, minor: 0, patch: 0},
    description: 'Governed messaging: an event broker + two governed topics.',
    boundedContextId,
    blueprint: bp => {
      // ── Event broker — the backbone all topics live on. The vendor (Service
      //    Bus, Pub/Sub, ...) is selected per-LiveSystem; the blueprint only
      //    declares that an abstract Broker is needed. ──
      const broker = bp.add(Broker({id: 'event-broker'}));

      // ── Topics — each is a first-class MessagingEntity that DEPENDS ON the
      //    broker: a topic cannot exist without its broker, so the agent
      //    reconciles the broker to Active first. Message retention is an
      //    architect GUARDRAIL: 72h is locked governance, so a consuming dev
      //    cannot shorten the audit/replay window or let messages expire faster
      //    than policy allows. ──
      const ordersTopic = bp.add(
        MessagingEntity({id: 'orders-topic'})
          .dependsOn(broker) // existence constraint: topic needs the broker
          .withMessageRetentionHours(72), // guardrail: locked retention window
      );
      const notificationsTopic = bp.add(
        MessagingEntity({id: 'notifications-topic'})
          .dependsOn(broker) // existence constraint: topic needs the broker
          .withMessageRetentionHours(72), // guardrail: locked retention window
      );

      return {broker, ordersTopic, notificationsTopic};
    },

    // ── No OPERATIONS — see the file header. The topology is fully governed;
    //    there is no application-domain choice to expose. (Partition count and
    //    other infra knobs are PARAMETERS, never operations — they would be
    //    architect guardrails here, not a dev-facing verb.) ──
  });
}
