/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * This is a vendor-AGNOSTIC Fractal for an on-prem application: a network policy
 * (SecurityGroup), an API and a web Workload, a public service (LoadBalancer),
 * persistent storage (ObjectStorage), and a legacy VirtualMachine. The blueprint
 * references only abstract Components — it NEVER names a vendor or an offer. The
 * OpenShift (RedHat) offers are chosen later, per component, when a LiveSystem is
 * built (see index.ts). Add a new vendor to the catalogue tomorrow and this
 * Fractal supports it unchanged.
 *
 * Two kinds of specialization live here:
 *   - GUARDRAILS — the architect calls `.withXxx()` at design time. The value is
 *     LOCKED: a consuming dev cannot override it. These are infra PARAMETERS
 *     (here: the network policy's ingress rules).
 *   - OPERATIONS — the typed Interface a consuming dev uses. These are
 *     APPLICATION-level verbs (the image each workload runs, how many replicas),
 *     NOT pass-through setters for infra/engine knobs.
 *
 * STRUCTURE is owned entirely by the blueprint:
 *   - links express runtime relationships. Both workloads are MEMBERS of the
 *     network policy (membership link — no settings). The web workload may reach
 *     the API workload on 8080 (traffic link — {fromPort, toPort, protocol}); the
 *     agent derives the NetworkPolicy rule from this link.
 *
 * Imported from the locked model surface: '@fractal_cloud/sdk/model'.
 */
import {
  createFractal,
  LoadBalancer,
  ObjectStorage,
  SecurityGroup,
  VirtualMachine,
  Workload,
} from '@fractal_cloud/sdk/model';

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'test-rg',
};

/**
 * Author the "on-prem application" Fractal. Returns a reusable, immutable
 * Fractal: `.specialize()` never mutates it, so it is safe to author once and
 * instantiate many times (see index.ts).
 */
export function authorFractal() {
  return createFractal({
    id: 'basic-onprem-openshift',
    version: {major: 1, minor: 0, patch: 0},
    description:
      'On-prem application: a network policy, API + web workloads, a public ' +
      'service, persistent storage, and a legacy VM.',
    boundedContextId,
    blueprint: bp => {
      // ── Network policy — the architect governs its ingress posture. ──
      //    Allow HTTP from anywhere and the API port from the cluster pod CIDR.
      const sg = bp.add(
        SecurityGroup({id: 'app-network-policy', displayName: 'Application Network Policy'}).withIngressRules([
          {fromPort: 80, toPort: 80, sourceCidr: '0.0.0.0/0'}, // guardrail
          {fromPort: 8080, toPort: 8080, sourceCidr: '10.128.0.0/14'}, // guardrail
        ]),
      );

      // ── Workloads — the app declares image/replicas via operations below. ──
      const api = bp.add(Workload({id: 'api-workload', displayName: 'API Workload'}));
      const web = bp.add(Workload({id: 'web-workload', displayName: 'Web Workload'}));

      // ── Public service + persistent storage + legacy VM. ──
      const lb = bp.add(LoadBalancer({id: 'web-service', displayName: 'Web Service Load Balancer'}));
      const storage = bp.add(ObjectStorage({id: 'app-storage', displayName: 'Application Storage'}));
      const vm = bp.add(VirtualMachine({id: 'legacy-vm', displayName: 'Legacy VM'}));

      // ── Links (runtime relationships) — blueprint owns ALL structure. ──
      // Both workloads are members of the network policy (membership: no settings).
      bp.link(api, sg);
      bp.link(web, sg);
      // The web workload may reach the API workload on 8080 (traffic rule).
      bp.link(web, api, {fromPort: 8080, toPort: 8080, protocol: 'tcp'});

      return {sg, api, web, lb, storage, vm};
    },

    // ── OPERATIONS — application-level verbs only. What the APP decides: the
    //    container image each workload runs and how many replicas it wants. ──
    operations: s => ({
      /** The container image the API workload runs. */
      withApiImage: (image: string) => s.api.set('image', image),
      /** The number of API workload replicas. */
      withApiReplicas: (replicas: number) => s.api.set('replicas', replicas),
      /** The container image the web workload runs. */
      withWebImage: (image: string) => s.web.set('image', image),
      /** The number of web workload replicas. */
      withWebReplicas: (replicas: number) => s.web.set('replicas', replicas),
    }),
  });
}
