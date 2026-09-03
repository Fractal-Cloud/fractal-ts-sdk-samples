/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * This is a vendor-AGNOSTIC Fractal: the blueprint references only abstract
 * Components (NetworkAndCompute.VirtualNetwork, .Subnet, .VirtualMachine). It
 * NEVER names a vendor or an offer — those are chosen later, per component, when
 * a LiveSystem is built (see vmware.ts). This particular sample is deployed to a
 * single on-prem vendor (VMware vSphere), but the blueprint itself carries no
 * trace of that: retarget it to any other vendor by swapping the selection in
 * vmware.ts, and this Fractal supports it unchanged.
 *
 * What lives here:
 *   - STRUCTURE — which Components exist, their DEPENDENCIES (`.dependsOn`) and
 *     their LINKS (`bp.link`). The blueprint owns ALL structure.
 *   - GUARDRAILS — infra PARAMETERS the architect locks at design time via each
 *     Component's `.withXxx()` setter (here: CIDR blocks). A consuming dev cannot
 *     override them.
 *
 * What does NOT live here:
 *   - OPERATIONS — application-level verbs a dev specializes through. This on-prem
 *     IaaS pattern exposes no application-domain choices (no folders/schemas/
 *     routes to declare), so `operations` is omitted entirely.
 *   - VENDOR PARAMETERS — the VsphereVm `template`, the VspherePortGroup
 *     `dvSwitchName`, the VsphereVlan `vlanId`, ... are OFFER config, passed at
 *     selection time in vmware.ts. Never on the blueprint.
 *
 * Imported from the locked model surface: '@fractal_cloud/sdk/model'.
 */
import {
  createFractal,
  VirtualNetwork,
  Subnet,
  VirtualMachine,
} from '@fractal_cloud/sdk/model';

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'test-rg',
};

/**
 * Author the "basic on-prem" Fractal: a virtual network with a server subnet and
 * two VMs (an api server behind a web server). Returns a reusable, immutable
 * Fractal — `.specialize()` never mutates it, so it is safe to author once and
 * instantiate many times (see vmware.ts).
 */
export function authorFractal() {
  return createFractal({
    id: 'basic-onprem-vmware',
    version: {major: 1, minor: 0, patch: 0},
    description: 'Governed on-prem IaaS: a virtual network, subnet + two VMs.',
    boundedContextId,
    blueprint: bp => {
      // ── Virtual network — address space is a governed guardrail. ──
      // This sample deploys to vSphere, but it shares the blueprint shape with
      // the cloud samples and follows the same two rules.
      //
      // The id is NOT cosmetic: on the cloud agents it becomes the network's
      // name (the AWS agent names the VPC after component.getId()). A generic
      // id such as 'main-network', which four samples used to share, is the
      // generic-id trap. Keep it specific to this sample.
      //
      // The address space must stay clear of the MANAGEMENT PLANE: the workload
      // account runs a hub-and-spoke topology, and the samples' old hard-coded
      // 10.0.0.0/16 swallowed the hub (10.0.0.0/21) while their old 10.0.1.0/24
      // was exactly hub-vpc-public-az2-subnet. Reserved, do not overlap:
      // 10.0.0.0/21, 10.0.16.0/20, 100.64.0.0/20, 100.64.16.0/20,
      // 172.31.0.0/16 — no sample may use 10.0.x at all. Each sample owns one
      // /16 from 10.180.0.0/16 up. Do not tidy either back to a generic value.
      const network = bp.add(
        VirtualNetwork({
          id: 'acme-onprem-vmware-network',
          displayName: 'Main Network',
        }).withCidrBlock('10.184.0.0/16'), // guardrail: the network's address space is fixed by the architect
      );

      // ── Server subnet — carved from the network's CIDR; depends on it
      //    (cannot exist before the network). Its own CIDR is governed. ──
      const subnet = bp.add(
        Subnet({id: 'server-vlan', displayName: 'Server VLAN'})
          .withCidrBlock('10.184.1.0/24') // guardrail: subnet range, fixed by the architect
          .dependsOn(network), // dependency: subnet needs the network first
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
      // Traffic-rule link (with settings): the web server may reach the api
      // server on 8080/tcp. The agent derives managed-SG egress/ingress rules
      // from these settings.
      bp.link(webServer, apiServer, {
        fromPort: 8080,
        toPort: 8080,
        protocol: 'tcp',
      });

      return {network, subnet, apiServer, webServer};
    },

    // No `operations`: this on-prem IaaS pattern has no application-level verbs to
    // expose. Everything here is a guardrail (locked) or offer config (chosen in
    // vmware.ts — the vSphere template, dvSwitch, vlanId).
  });
}
