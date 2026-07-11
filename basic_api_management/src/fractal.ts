/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * This is a vendor-AGNOSTIC Fractal: the blueprint references only the abstract
 * Component (APIManagement.ApiGateway). It NEVER names a vendor or an offer —
 * those are chosen later when a LiveSystem is built (see index.ts). Add a new
 * gateway vendor to the catalogue tomorrow and this Fractal supports it
 * unchanged.
 *
 * This sample is the CLEAREST illustration of the GUARDRAILS vs OPERATIONS
 * distinction, because both live on the SAME component:
 *
 *   - GUARDRAILS — the architect calls `.withXxx()` at design time. The value is
 *     LOCKED governance: a consuming dev cannot override it. These are
 *     INFRA/SECURITY parameters of the gateway itself — whether it is
 *     HTTPS-only, its global rate limit, its CORS allow-list. They describe how
 *     the gateway is *governed*, not what the app exposes through it.
 *   - OPERATIONS — the typed Interface a consuming dev uses. Here there is ONE,
 *     and it is purely APPLICATION-level: `withRoute(r)` lets the app declare a
 *     route it exposes (path → upstream). The app owns its routes; the architect
 *     owns the security posture. A route is app intent, never an infra knob.
 *
 * The split in one line: httpsOnly / rateLimit / cors are GUARDRAILS (locked by
 * the architect); routes are the APP's (declared via the withRoute operation).
 *
 * Imported from the locked model surface: '@fractal_cloud/sdk/model'.
 */
import {createFractal, ApiGateway} from '@fractal_cloud/sdk/model';

/**
 * A single route the application exposes through the gateway. This is the
 * app-level vocabulary of the operation — `path` and (optionally) the HTTP
 * `methods` and the `upstream` service the gateway forwards to. No vendor or
 * infra knobs appear here: those are guardrails, set by the architect.
 */
export type Route = {
  path: string;
  methods?: string[];
  upstream?: string;
};

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'wizard',
};

/**
 * Author the "governed API gateway" Fractal. Returns a reusable, immutable
 * Fractal: `.specialize()` never mutates it, so it is safe to author once and
 * instantiate many times (see index.ts).
 */
export function authorFractal() {
  return createFractal({
    id: 'basic-api-management',
    version: {major: 1, minor: 0, patch: 0},
    description: 'Governed API gateway: HTTPS-only, rate-limited, CORS-locked.',
    boundedContextId,
    blueprint: bp => {
      // ── API gateway — its SECURITY POSTURE is governed by the architect.
      //    These three guardrails are LOCKED: a consuming dev specializing this
      //    Fractal cannot weaken them. They are infra/security PARAMETERS of the
      //    gateway, not anything the application gets to decide. ──
      const gateway = bp.add(
        ApiGateway({id: 'api-gateway', displayName: 'API Gateway'})
          .withHttpsOnly(true) // guardrail: never serve plain HTTP
          .withRateLimit({requestsPerSecond: 1000}) // guardrail: global throttle
          .withCors({allowOrigins: ['https://acme.com']}), // guardrail: CORS allow-list
      );

      return {gateway};
    },

    // ── OPERATIONS — application-level verbs only. The single op here is
    //    `withRoute`: the APP declares a route it exposes (path → upstream). It
    //    appends to the gateway's `routes` list — each call adds one route. This
    //    is the canonical app-level operation: routes are the app's intent, in
    //    contrast to the architect's locked security guardrails above. ──
    operations: s => ({
      /** Expose one application route through the gateway (path → upstream). */
      withRoute: (r: Route) => s.gateway.append('routes', r),
    }),
  });
}
