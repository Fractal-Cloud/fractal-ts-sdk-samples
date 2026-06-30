/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * This is a vendor-AGNOSTIC Fractal: the blueprint references only abstract
 * Components (Security.ServiceMesh, Security.IdentityProvider). It NEVER names a
 * vendor or an offer — those are chosen later, per component, when a LiveSystem
 * is built (see index.ts). Add a new vendor to the catalogue tomorrow and this
 * Fractal supports it unchanged.
 *
 * Two kinds of specialization live here:
 *   - GUARDRAILS — the architect calls `.withXxx()` at design time. The value is
 *     LOCKED: a consuming dev cannot override it. These are security-posture
 *     PARAMETERS (mTLS mode, password policy, MFA enforcement). They encode the
 *     organization's non-negotiable security governance.
 *   - OPERATIONS — the typed Interface a consuming dev uses. These are
 *     APPLICATION-level verbs (what the app decides — the name of its user
 *     directory), NOT pass-through setters for security knobs. Operations carry
 *     the app's intent into neutral params; they never expose governance levers.
 *
 * Imported from the locked model surface: '@fractal_cloud/sdk/model'.
 */
import {
  createFractal,
  ServiceMesh,
  IdentityProvider,
} from '@fractal_cloud/sdk/model';

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'wizard',
};

/**
 * Author the "governed security" Fractal. Returns a reusable, immutable Fractal:
 * `.specialize()` never mutates it, so it is safe to author once and instantiate
 * many times (see index.ts).
 */
export function authorFractal() {
  return createFractal({
    id: 'basic-security',
    version: {major: 1, minor: 0, patch: 0},
    description:
      'Governed security: a service mesh + an identity provider, both locked ' +
      'to the organization security posture.',
    boundedContextId,
    blueprint: bp => {
      // ── Service mesh — transport security is governed. Strict mTLS is the
      //    floor: every service-to-service call is mutually authenticated and
      //    encrypted, and a consuming dev cannot weaken it. ──
      const mesh = bp.add(
        ServiceMesh({id: 'mesh'}).withMtlsMode('strict'), // guardrail
      );

      // ── Identity provider — account security is governed. Minimum password
      //    length and mandatory MFA are locked posture; the app only gets to
      //    name its user directory (the withUserDirectory operation). ──
      const idp = bp.add(
        IdentityProvider({id: 'idp'})
          .withPasswordPolicy({minLength: 12}) // guardrail
          .withMfaConfiguration('ON'), // guardrail
      );

      return {mesh, idp};
    },

    // ── OPERATIONS — application-level verbs only. What the APP decides: the
    //    name of the user directory it owns. The security posture itself
    //    (mTLS / password policy / MFA) is architect-governed and not exposed. ──
    operations: s => ({
      /** The application names the user directory it owns. */
      withUserDirectory: (name: string) =>
        s.idp.set('userDirectoryName', name),
    }),
  });
}
