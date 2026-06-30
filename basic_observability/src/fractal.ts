/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * This is a vendor-AGNOSTIC Fractal: the blueprint references only abstract
 * Components (Observability.Monitoring, Observability.Tracing,
 * Observability.Logging). It NEVER names a vendor or an offer — those are chosen
 * later, per component, when a LiveSystem is built (see index.ts).
 *
 * Two kinds of specialization can live here:
 *   - GUARDRAILS — the architect calls `.withXxx()` at design time. The value is
 *     LOCKED: a consuming dev cannot override it. These are infra PARAMETERS
 *     (retention, scrape interval, sampling rate).
 *   - OPERATIONS — the typed Interface a consuming dev uses. These are
 *     APPLICATION-level verbs (what the app decides — its dashboards, its log
 *     streams), NOT pass-through setters for infra parameters.
 *
 * This is a pure PLATFORM-observability stack: the architect governs retention
 * and sampling, and there are no application-level verbs to expose. So this
 * Fractal declares guardrails only and OMITS `operations` entirely.
 *
 * Imported from the locked model surface: '@fractal_cloud/sdk/model'.
 */
import {
  createFractal,
  Monitoring,
  Tracing,
  Logging,
} from '@fractal_cloud/sdk/model';

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'wizard',
};

/**
 * Author the "governed observability" Fractal. Returns a reusable, immutable
 * Fractal: `.specialize()` never mutates it, so it is safe to author once and
 * instantiate many times (see index.ts).
 */
export function authorFractal() {
  return createFractal({
    id: 'basic-observability',
    version: {major: 1, minor: 0, patch: 0},
    description:
      'Governed observability: metrics monitoring + distributed tracing + logging.',
    boundedContextId,
    blueprint: bp => {
      // ── Monitoring — retention and scrape cadence are governed. ──
      const monitoring = bp.add(
        Monitoring({id: 'monitoring'})
          .withRetentionDays(30) // guardrail: how long metrics are kept
          .withScrapeInterval(15), // guardrail: scrape cadence in seconds
      );

      // ── Tracing — retention and sampling rate are governed. ──
      const tracing = bp.add(
        Tracing({id: 'tracing'})
          .withRetentionDays(7) // guardrail: how long traces are kept
          .withSamplingRate(0.1), // guardrail: 10% trace sampling
      );

      // ── Logging — retention is governed. ──
      const logging = bp.add(
        Logging({id: 'logging'}).withRetentionDays(30), // guardrail
      );

      return {monitoring, tracing, logging};
    },

    // No `operations`: this is platform observability. The architect's
    // guardrails (retention/scrape/sampling) fully govern the stack and there
    // are no application-level verbs for a consuming dev to call.
  });
}
