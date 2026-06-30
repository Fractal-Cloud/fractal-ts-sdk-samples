/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * This is a vendor-AGNOSTIC Fractal: the blueprint references only abstract
 * Components (NetworkAndCompute.VirtualNetwork, .Subnet, .SecurityGroup,
 * .ContainerPlatform and CustomWorkloads.Workload). It NEVER names a vendor or
 * an offer — those are chosen later, per component, when a LiveSystem is built
 * (see index.ts). Add a new vendor to the catalogue tomorrow and this Fractal
 * supports it unchanged.
 *
 * Two kinds of specialization live here:
 *   - GUARDRAILS — the architect calls `.withXxx()` at design time. The value is
 *     LOCKED: a consuming dev cannot override it. These are infra PARAMETERS
 *     (CIDR blocks, ingress rules, node pools / autoscaling).
 *   - OPERATIONS — the typed Interface a consuming dev uses. These are
 *     APPLICATION-level verbs (what the app decides — which container image it
 *     ships and how many replicas it wants), NOT pass-through setters for infra
 *     knobs. Operations carry the app's intent into neutral params.
 *
 * STRUCTURE (deps + links) is owned entirely by the blueprint:
 *   - Subnet/SecurityGroup depend on the VirtualNetwork.
 *   - ContainerPlatform depends on the Subnet; each Workload depends on the
 *     cluster AND the subnet.
 *   - Links: each workload is a member of the app SecurityGroup; the web tier
 *     links to the api tier with a traffic rule on port 8080.
 *
 * Imported from the locked model surface: '@fractal_cloud/sdk/model'.
 */
import {
  createFractal,
  VirtualNetwork,
  Subnet,
  SecurityGroup,
  ContainerPlatform,
  Workload,
} from '@fractal_cloud/sdk/model';

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'wizard',
};

/**
 * Author the "governed container platform" Fractal. Returns a reusable,
 * immutable Fractal: `.specialize()` never mutates it, so it is safe to author
 * once and instantiate many times (see index.ts).
 */
export function authorFractal() {
  return createFractal({
    id: 'basic-container-platform',
    version: {major: 1, minor: 0, patch: 0},
    description:
      'Governed container platform: a network, a managed cluster, and a ' +
      'web + api workload pair.',
    boundedContextId,
    blueprint: bp => {
      // ── Network topology — CIDR blocks are governed. ──
      const network = bp.add(
        VirtualNetwork({id: 'main-network'}).withCidrBlock('10.0.0.0/16'), // guardrail
      );
      const subnet = bp.add(
        Subnet({id: 'private-subnet'})
          .withCidrBlock('10.0.1.0/24') // guardrail
          .dependsOn(network),
      );

      // ── Security posture — the ingress rules are governed: HTTP from anywhere
      //    to the web tier, internal-only traffic on 8080 to the api tier. ──
      const sg = bp.add(
        SecurityGroup({id: 'app-sg'})
          .dependsOn(network)
          .withIngressRules([
            {fromPort: 80, toPort: 80, sourceCidr: '0.0.0.0/0'}, // guardrail
            {fromPort: 8080, toPort: 8080, sourceCidr: '10.0.0.0/16'}, // guardrail
          ]),
      );

      // ── Managed cluster — node pool topology + autoscaling are governed. ──
      const cluster = bp.add(
        ContainerPlatform({id: 'app-cluster'})
          .dependsOn(subnet)
          .withNodePools([
            {
              name: 'system',
              minNodeCount: 1,
              maxNodeCount: 3,
              autoscalingEnabled: true,
            }, // guardrail: cluster capacity is an infra decision
          ]),
      );

      // ── Workloads — the api and web tiers. Each depends on the cluster (where
      //    it runs) and the subnet (where it is placed). The container image and
      //    replica count are NOT set here: they are application choices, exposed
      //    as operations below. ──
      const api = bp.add(
        Workload({id: 'api-workload'}).dependsOn(cluster).dependsOn(subnet),
      );
      const web = bp.add(
        Workload({id: 'web-workload'}).dependsOn(cluster).dependsOn(subnet),
      );

      // ── Links (structure) — membership + traffic rules, architect-owned. ──
      bp.link(api, sg); // api is a member of the app security group
      bp.link(web, sg); // web is a member of the app security group
      bp.link(web, api, {fromPort: 8080, toPort: 8080, protocol: 'tcp'}); // web → api

      return {network, subnet, sg, cluster, api, web};
    },

    // ── OPERATIONS — application-level verbs only. What the APP decides: which
    //    container image each tier ships and how many replicas it wants. These
    //    are deployment choices the app owns, NOT infra knobs (which stay
    //    architect guardrails or offer config). ──
    operations: s => ({
      /** The container image the web tier ships. */
      withWebImage: (image: string) => s.web.set('image', image),
      /** How many replicas of the web tier to run. */
      withWebReplicas: (replicas: number) => s.web.set('replicas', replicas),
      /** The container image the api tier ships. */
      withApiImage: (image: string) => s.api.set('image', image),
      /** How many replicas of the api tier to run. */
      withApiReplicas: (replicas: number) => s.api.set('replicas', replicas),
    }),
  });
}
