/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * This is a vendor-AGNOSTIC Fractal: the blueprint references only abstract
 * Components (NetworkAndCompute.VirtualNetwork, .Subnet, .SecurityGroup,
 * .VirtualMachine). It NEVER names a vendor or an offer — those are chosen later,
 * per component, when a LiveSystem is built (see <cloud>.ts). Add a new vendor to
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
 *     OFFER config, passed at selection time in <cloud>.ts. Never on the blueprint.
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
 * is safe to author once and instantiate many times (see <cloud>.ts).
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
      // Two separate things are locked down here, for two different reasons.
      //
      // The id is NOT cosmetic: the AWS agent names the VPC after it
      // (VirtualPrivateCloud.java builds VpcConfig.fromMap(params, region,
      // component.getId())). Ownership is resolved from resource tags, so a
      // shared id does not merge two samples' VPCs — but a generic id such as
      // 'main-network', which four samples used to share, is still the
      // generic-id trap. Keep it specific to this sample.
      //
      // The address space must stay clear of the MANAGEMENT PLANE. The workload
      // account runs a hub-and-spoke topology, and the samples' old hard-coded
      // 10.0.0.0/16 swallowed the hub (10.0.0.0/21) while their old 10.0.1.0/24
      // was exactly hub-vpc-public-az2-subnet — hence "The CIDR '10.0.1.0/24'
      // conflicts with another subnet". Reserved, do not overlap: 10.0.0.0/21
      // (hub-vpc), 10.0.16.0/20 (evergreen-vpc), 100.64.0.0/20 and
      // 100.64.16.0/20 (pod CIDRs), 172.31.0.0/16 (default VPC). No sample may
      // use 10.0.x at all. Each sample owns one /16 from 10.180.0.0/16 up and
      // keeps its subnets inside it. Do not tidy either back to a generic value.
      const network = bp.add(
        VirtualNetwork({
          id: 'acme-iaas-network',
          displayName: 'Main Network',
        }).withCidrBlock('10.182.0.0/16'), // guardrail: the network's address space is fixed by the architect
      );

      // ── Public subnet — carved from the network's CIDR; depends on it
      //    (cannot exist before the network). Its own CIDR is governed. ──
      const subnet = bp.add(
        Subnet({id: 'public-subnet', displayName: 'Public Subnet'})
          .withCidrBlock('10.182.1.0/24') // guardrail: subnet range, fixed by the architect
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
        VirtualMachine({id: 'api-server', displayName: 'API Server'}).dependsOn(
          subnet,
        ),
      );

      // ── Web server — frontend VM in the subnet (depends on it); proxies to
      //    the api server. ──
      const webServer = bp.add(
        VirtualMachine({id: 'web-server', displayName: 'Web Server'}).dependsOn(
          subnet,
        ),
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
    // Everything here is a guardrail (locked) or offer config (chosen in <cloud>.ts).
  });
}
