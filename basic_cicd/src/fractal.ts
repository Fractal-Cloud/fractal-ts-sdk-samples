/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * This is a vendor-AGNOSTIC Fractal: the blueprint references only abstract
 * Components (NetworkAndCompute.VirtualNetwork, .Subnet, .SecurityGroup,
 * .VirtualMachine). It NEVER names a vendor or an offer — those are chosen later,
 * per component, when a LiveSystem is built (see index.ts). Add a new vendor to
 * the catalogue tomorrow and this Fractal supports it unchanged.
 *
 * Two kinds of specialization can live in a Fractal:
 *   - GUARDRAILS — the architect calls a component `.withXxx()` at design time.
 *     The value is LOCKED: a consuming dev cannot override it. These are
 *     infra/network PARAMETERS (cidrBlock, ingressRules, ...).
 *   - OPERATIONS — the typed Interface a consuming dev uses. These are
 *     APPLICATION-level verbs (what the app decides — its routes, its schemas),
 *     NOT pass-through setters for infra knobs.
 *
 * This sample is a pure IaaS network/CI-CD scaffold: there is no application
 * layer making domain choices, so there are NO operations — the `operations`
 * key is deliberately omitted. Everything here is a locked guardrail. Vendor-only
 * knobs (amiId, instanceType, ...) are NOT here; they are offer config selected
 * in index.ts.
 *
 * Imported from the locked model surface: '@fractal_cloud/sdk/model'.
 */
import {
  createFractal,
  VirtualNetwork,
  Subnet,
  SecurityGroup,
  VirtualMachine,
} from '@fractal_cloud/sdk/model';

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'wizard',
};

/**
 * Author the "basic CI/CD" Fractal. Returns a reusable, immutable Fractal:
 * `.specialize()` never mutates it, so it is safe to author once and instantiate
 * many times (see index.ts).
 */
export function authorFractal() {
  return createFractal({
    id: 'basic-cicd',
    version: {major: 1, minor: 0, patch: 0},
    description:
      'Basic IaaS scaffold for a CI/CD pipeline: a VPC, a public subnet, a ' +
      'web security group, and two VMs (web + API).',
    boundedContextId,
    blueprint: bp => {
      // ── Network — the VPC's address space is a governed guardrail. ──
      const network = bp.add(
        VirtualNetwork({id: 'main-network', displayName: 'Main Network'}).withCidrBlock('10.0.0.0/16'),
      );

      // ── Public subnet — carved from the VPC; cannot exist without it. ──
      const subnet = bp.add(
        Subnet({id: 'public-subnet', displayName: 'Public Subnet'})
          .withCidrBlock('10.0.1.0/24') // guardrail: subnet range
          .dependsOn(network), // structural dependency: subnet → VPC
      );

      // ── Web security group — ingress posture is governed. The SG belongs to
      //    the VPC, so it depends on it. SSH (22) for ops + HTTP (80) for the
      //    web tier are the only inbound rules permitted. ──
      const webSg = bp.add(
        SecurityGroup({id: 'web-sg', displayName: 'Web Security Group'})
          .dependsOn(network)
          .withIngressRules([
            {fromPort: 22, toPort: 22, sourceCidr: '0.0.0.0/0'},
            {fromPort: 80, toPort: 80, sourceCidr: '0.0.0.0/0'},
          ]),
      );

      // ── Compute — both VMs live in the public subnet. ──
      const apiServer = bp.add(
        VirtualMachine({id: 'api-server', displayName: 'API Server'}).dependsOn(subnet),
      );
      const webServer = bp.add(
        VirtualMachine({id: 'web-server', displayName: 'Web Server'}).dependsOn(subnet),
      );

      // ── Link: web-server → api-server on TCP 8080. The blueprint owns all
      //    links. This is a traffic rule (carries {fromPort, toPort, protocol}),
      //    so the agent derives the matching managed-SG egress/ingress rules
      //    that let the web tier reach the API tier on 8080. ──
      bp.link(webServer, apiServer, {
        fromPort: 8080,
        toPort: 8080,
        protocol: 'tcp',
      });

      return {network, subnet, webSg, apiServer, webServer};
    },
    // No `operations`: this AWS-only IaaS/CI-CD sample has no application-level
    // verbs. All specialization above is architect guardrails; vendor knobs are
    // offer config chosen at selection time (index.ts).
  });
}
