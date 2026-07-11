/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * This is a vendor-AGNOSTIC Fractal: the blueprint references only abstract
 * Components (NetworkAndCompute.VirtualNetwork, .Subnet, .SecurityGroup,
 * .VirtualMachine). It NEVER names a vendor or an offer — those are chosen later,
 * per component, when a LiveSystem is built (see index.ts). Add a new vendor to
 * the catalogue tomorrow and this Fractal supports it unchanged.
 *
 * What lives here:
 *   - STRUCTURE — which Components exist, their DEPENDENCIES (`.dependsOn`) and
 *     their LINKS (`bp.link`). The blueprint owns ALL structure.
 *   - GUARDRAILS — infra/engine PARAMETERS the architect locks at design time via
 *     each Component's `.withXxx()` setter (e.g. CIDR blocks, ingress rules). A
 *     consuming dev cannot override them.
 *
 * What does NOT live here:
 *   - OPERATIONS — application-level verbs a dev specializes through. This IaaS
 *     pattern exposes no application-domain choices (no folders/schemas/routes to
 *     declare), so `operations` is omitted entirely.
 *   - VENDOR PARAMETERS — amiId, instanceType, vmSize, machineType, shape, ... are
 *     OFFER config, passed at selection time in index.ts. Never on the blueprint.
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
 * Author the "basic IaaS" Fractal: a virtual network with a public subnet, a
 * web-facing security group, and two VMs (an api server behind a web server).
 * Returns a reusable, immutable Fractal — `.specialize()` never mutates it, so it
 * is safe to author once and instantiate many times (see index.ts).
 */
export function authorFractal() {
  return createFractal({
    id: 'basic-iaas',
    version: {major: 1, minor: 0, patch: 0},
    description:
      'Governed IaaS: a virtual network, subnet, security group + VMs.',
    boundedContextId,
    blueprint: bp => {
      // ── Virtual network — address space is a governed guardrail. ──
      const network = bp.add(
        VirtualNetwork({id: 'main-network', displayName: 'Main Network'}).withCidrBlock('10.0.0.0/16'), // guardrail: the network's address space is fixed by the architect
      );

      // ── Public subnet — carved from the network's CIDR; depends on it
      //    (cannot exist before the network). Its own CIDR is governed. ──
      const subnet = bp.add(
        Subnet({id: 'public-subnet', displayName: 'Public Subnet'})
          .withCidrBlock('10.0.1.0/24') // guardrail: subnet range, fixed by the architect
          .dependsOn(network), // dependency: subnet needs the network first
      );

      // ── Web security group — the perimeter posture is governed: inbound SSH
      //    (22) for admin and HTTP (80) for serving. Depends on the network. ──
      const securityGroup = bp.add(
        SecurityGroup({id: 'web-sg', displayName: 'Web Security Group'})
          .withIngressRules([
            {fromPort: 22, toPort: 22, sourceCidr: '0.0.0.0/0'}, // guardrail: allow SSH
            {fromPort: 80, toPort: 80, sourceCidr: '0.0.0.0/0'}, // guardrail: allow HTTP
          ])
          .dependsOn(network), // dependency: the SG belongs to the network
      );

      // ── API server — backend VM in the subnet (depends on it). ──
      const apiServer = bp.add(
        VirtualMachine({id: 'api-server', displayName: 'API Server'}).dependsOn(subnet),
      );

      // ── Web server — frontend VM in the subnet (depends on it); proxies to
      //    the api server. ──
      const webServer = bp.add(
        VirtualMachine({id: 'web-server', displayName: 'Web Server'}).dependsOn(subnet),
      );

      // ── Links (runtime relationships — distinct from dependencies). ──
      // Membership links (no settings): each VM joins the security group. The
      // presence of the link is the only signal the agent needs.
      bp.link(apiServer, securityGroup);
      bp.link(webServer, securityGroup);
      // Traffic-rule link (with settings): the web server may reach the api
      // server on 8080/tcp. The agent derives managed-SG egress/ingress rules
      // from these settings.
      bp.link(webServer, apiServer, {
        fromPort: 8080,
        toPort: 8080,
        protocol: 'tcp',
      });

      return {network, subnet, securityGroup, apiServer, webServer};
    },

    // No `operations`: this IaaS pattern has no application-level verbs to expose.
    // Everything here is a guardrail (locked) or offer config (chosen in index.ts).
  });
}
