/**
 * fractal.ts
 *
 * Defines a cloud-agnostic Fractal (blueprint) with four IaaS components:
 *   - VirtualNetwork  (a VPC)
 *   - Subnet          (depends on the VirtualNetwork)
 *   - SecurityGroup   (depends on the VirtualNetwork)
 *   - VirtualMachine  (depends on the Subnet)
 *
 * This blueprint is identical in structure to the basic_iaas sample.
 * The difference is in how it gets deployed — see index.ts for the
 * CI/CD wait mode that blocks until infrastructure is fully Active.
 *
 * Dependencies are auto-wired by the node hierarchy — no string IDs needed.
 * No AWS-specific details appear here.
 */

import {
  BoundedContext,
  Fractal,
  KebabCaseString,
  OwnerId,
  OwnerType,
  VirtualNetwork,
  Subnet,
  SecurityGroup,
  VirtualMachine,
  Version,
} from '@fractal_cloud/sdk';

// ── Bounded Context ────────────────────────────────────────────────────────────

export const bcId = BoundedContext.Id.getBuilder()
  .withOwnerType(OwnerType.Personal)
  .withOwnerId(OwnerId.getBuilder().withValue(process.env['OWNER_ID']!).build())
  .withName(KebabCaseString.getBuilder().withValue('wizard').build())
  .build();

// ── Blueprint ──────────────────────────────────────────────────────────────────

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

// ── Network (components order: [vpc, subnet, securityGroup, ...vms]) ──────────

const network = VirtualNetwork.create({
  id: 'main-network',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Main VPC',
  description: 'Primary VPC for the CI/CD IaaS workload',
  cidrBlock: '10.1.0.0/16',
})
  .withSubnets([
    Subnet.create({
      id: 'public-subnet',
      version: {major: 1, minor: 0, patch: 0},
      displayName: 'Public Subnet',
      description: 'Public-facing subnet inside the main VPC',
      cidrBlock: '10.1.1.0/24',
    }).withVirtualMachines([webServer, apiServer]),
  ])
  .withSecurityGroups([
    SecurityGroup.create({
      id: 'web-sg',
      version: {major: 1, minor: 0, patch: 0},
      displayName: 'Web Security Group',
      description: 'Allows inbound SSH and HTTP traffic',
      ingressRules: [
        {protocol: 'tcp', fromPort: 22, toPort: 22, sourceCidr: '0.0.0.0/0'},
        {protocol: 'tcp', fromPort: 80, toPort: 80, sourceCidr: '0.0.0.0/0'},
      ],
    }),
  ]);

export const fractal = Fractal.getBuilder()
  .withId(
    Fractal.Id.getBuilder()
      .withBoundedContextId(bcId)
      .withName(
        KebabCaseString.getBuilder().withValue('basic-cicd-fractal').build(),
      )
      .withVersion(
        Version.getBuilder().withMajor(1).withMinor(0).withPatch(0).build(),
      )
      .build(),
  )
  .withComponents([...network.components])
  .build();
