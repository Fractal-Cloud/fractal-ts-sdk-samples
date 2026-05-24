/**
 * fractal.ts
 *
 * Defines a cloud-agnostic Fractal (blueprint) for a basic on-prem IaaS workload:
 *
 *   VirtualNetwork (main-network)
 *     └── Subnet (server-vlan, CIDR 10.0.1.0/24)
 *         └── VirtualMachine (web-server) — links to api-server on port 8080
 *         └── VirtualMachine (api-server)
 *
 * Dependencies are auto-wired by the node hierarchy — no string IDs needed.
 * No vSphere-specific details appear here — the blueprint can be satisfied
 * by any IaaS provider.
 */

import {
  BoundedContext,
  Fractal,
  KebabCaseString,
  OwnerId,
  OwnerType,
  Subnet,
  Version,
  VirtualMachine,
  VirtualNetwork,
} from '@fractal_cloud/sdk';

// ── Bounded Context ────────────────────────────────────────────────────────────

export const bcId = BoundedContext.Id.getBuilder()
  .withOwnerType(OwnerType.Organizational)
  .withOwnerId(OwnerId.getBuilder().withValue(process.env['OWNER_ID']!).build())
  .withName(KebabCaseString.getBuilder().withValue(process.env['BC_NAME'] ?? 'test-rg').build())
  .build();

// ── VMs (declared before the network so links can reference their IDs) ─────────

const apiServer = VirtualMachine.create({
  id: 'api-server',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'API Server',
  description: 'Backend API server — listens on port 8080',
});

const webServer = VirtualMachine.create({
  id: 'web-server',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Web Server',
  description: 'Frontend web server — proxies to the API server on port 8080',
}).linkToVirtualMachine([{target: apiServer, fromPort: 8080}]);

// ── Network (components order: [network, subnet, ...vms]) ────────────────────

const network = VirtualNetwork.create({
  id: 'main-network',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Main Network',
  description: 'Primary distributed port group for the on-prem workload',
  cidrBlock: '10.0.0.0/16',
}).withSubnets([
  Subnet.create({
    id: 'server-vlan',
    version: {major: 1, minor: 0, patch: 0},
    displayName: 'Server VLAN',
    description: 'VLAN segment hosting the web and API servers',
    cidrBlock: '10.0.1.0/24',
  }).withVirtualMachines([webServer, apiServer]),
]);

// ── Fractal ────────────────────────────────────────────────────────────────────

export const fractal = Fractal.getBuilder()
  .withId(
    Fractal.Id.getBuilder()
      .withBoundedContextId(bcId)
      .withName(
        KebabCaseString.getBuilder()
          .withValue('basic-onprem-vmware')
          .build(),
      )
      .withVersion(
        Version.getBuilder().withMajor(1).withMinor(0).withPatch(0).build(),
      )
      .build(),
  )
  .withComponents([...network.components])
  .build();
