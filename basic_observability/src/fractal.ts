/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * This is a vendor-AGNOSTIC Fractal: the blueprint references only abstract
 * Components (NetworkAndCompute.VirtualNetwork, .Subnet, .ContainerPlatform,
 * APIManagement.ApiGateway and Observability.Monitoring, .Tracing, .Logging).
 * It NEVER names a vendor or an offer — those are chosen later, per component,
 * when a LiveSystem is built (see <cloud>.ts).
 *
 * Two kinds of specialization can live here:
 *   - GUARDRAILS — the architect calls `.withXxx()` at design time. The value is
 *     LOCKED: a consuming dev cannot override it. These are infra PARAMETERS
 *     (retention, scrape interval, sampling rate, CIDR blocks, node pools).
 *   - OPERATIONS — the typed Interface a consuming dev uses. These are
 *     APPLICATION-level verbs (what the app decides — its dashboards, its log
 *     streams), NOT pass-through setters for infra parameters.
 *
 * This is a pure PLATFORM-observability stack: the architect governs retention
 * and sampling, and there are no application-level verbs to expose. So this
 * Fractal declares guardrails only and OMITS `operations` entirely.
 *
 * STRUCTURE (deps + links) is owned entirely by the blueprint:
 *   - Subnet depends on the VirtualNetwork; the cluster depends on the Subnet.
 *   - Monitoring, Tracing, Logging and the ApiGateway each depend on the CLUSTER.
 *     These are self-hosted (CaaS) capabilities: they are Kubernetes workloads,
 *     and the agent resolves WHICH cluster to install them on from this
 *     dependency edge. Without it the component has no target and never starts.
 *   - Each observability capability LINKS to the gateway. The gateway is how
 *     Grafana / Prometheus / Alertmanager / Kibana are published — on the
 *     gateway's host, behind its routes, instead of on public load balancers of
 *     their own.
 *
 * Imported from the locked model surface: '@fractal_cloud/sdk/model'.
 */
import {
  createFractal,
  addDependency,
  AnyNode,
  VirtualNetwork,
  Subnet,
  ContainerPlatform,
  ApiGateway,
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
 * Declare that `node` depends on `target`, returning a node of the same type.
 *
 * The NetworkAndCompute node types carry a typed `.dependsOn()` setter, but the
 * Observability and APIManagement ones do not (SDK 2.5.4), so the edge is
 * authored with the exported `addDependency` primitive instead — the same
 * primitive `.dependsOn()` is built on. Structure stays architect-owned either
 * way.
 *
 * Call it LAST in a chain: the returned object keeps the node's `.withXxx()`
 * setters, but each of those closes over the state it was created with, so
 * chaining after this call would drop the dependency.
 */
function dependingOn<N extends AnyNode>(node: N, target: AnyNode): N {
  return {...node, state: addDependency(node.state, target.state.id)};
}

/**
 * Author the "governed observability" Fractal. Returns a reusable, immutable
 * Fractal: `.specialize()` never mutates it, so it is safe to author once and
 * instantiate many times (see <cloud>.ts).
 */
export function authorFractal() {
  return createFractal({
    id: 'basic-observability',
    version: {major: 1, minor: 0, patch: 0},
    description:
      'Governed observability: metrics monitoring + distributed tracing + ' +
      'logging, on a managed cluster, published through an API gateway.',
    boundedContextId,
    blueprint: bp => {
      // ── Network topology — CIDR blocks are governed. ──
      const network = bp.add(
        VirtualNetwork({
          id: 'platform-network',
          displayName: 'Platform Network',
        }).withCidrBlock('10.0.0.0/16'), // guardrail
      );
      const subnet = bp.add(
        Subnet({id: 'platform-subnet', displayName: 'Platform Subnet'})
          .withCidrBlock('10.0.1.0/24') // guardrail
          .dependsOn(network),
      );

      // ── The cluster the observability stack runs ON. Node pool topology and
      //    autoscaling are governed. ──
      const cluster = bp.add(
        ContainerPlatform({
          id: 'platform-cluster',
          displayName: 'Platform Cluster',
        })
          .dependsOn(subnet)
          .withNodePools([
            {
              name: 'system',
              minNodeCount: 2,
              maxNodeCount: 4,
              autoscalingEnabled: true,
            }, // guardrail: an observability stack is not a single-node workload
          ]),
      );

      // ── The gateway every console is published behind. No guardrail is set
      //    on it: the ApiGateway Component's neutral parameters (httpsOnly,
      //    cors, rateLimit, routes) are not in the parameter contract any
      //    in-cluster gateway offer publishes, so setting one here would be
      //    stripped on the way to the agent and read as governance that is not
      //    actually enforced. The gateway's own settings live with the offer,
      //    in <cloud>.ts. ──
      const gateway = bp.add(
        dependingOn(
          ApiGateway({
            id: 'platform-gateway',
            displayName: 'Platform Gateway',
          }),
          cluster,
        ),
      );

      // ── Monitoring — retention and scrape cadence are governed. ──
      const monitoring = bp.add(
        dependingOn(
          Monitoring({id: 'monitoring', displayName: 'Monitoring'})
            .withRetentionDays(30) // guardrail: how long metrics are kept
            .withScrapeInterval(15), // guardrail: scrape cadence in seconds
          cluster,
        ),
      );

      // ── Tracing — retention and sampling rate are governed. ──
      const tracing = bp.add(
        dependingOn(
          Tracing({id: 'tracing', displayName: 'Tracing'})
            .withRetentionDays(7) // guardrail: how long traces are kept
            .withSamplingRate(0.1), // guardrail: 10% trace sampling
          cluster,
        ),
      );

      // ── Logging — retention is governed. ──
      const logging = bp.add(
        dependingOn(
          Logging({id: 'logging', displayName: 'Logging'}).withRetentionDays(
            30,
          ), // guardrail
          cluster,
        ),
      );

      // ── Links (structure) — each capability is published through the gateway,
      //    which is what keeps its console off a public load balancer of its
      //    own. Architect-owned. ──
      bp.link(monitoring, gateway);
      bp.link(tracing, gateway);
      bp.link(logging, gateway);

      return {network, subnet, cluster, gateway, monitoring, tracing, logging};
    },

    // No `operations`: this is platform observability. The architect's
    // guardrails (retention/scrape/sampling, CIDRs, node pools) fully govern the
    // stack and there are no application-level verbs for a consuming dev to
    // call.
  });
}
