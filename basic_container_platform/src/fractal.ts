/**
 * fractal.ts
 *
 * Defines a cloud-agnostic Fractal (blueprint) for a two-tier container workload:
 *
 *   ContainerPlatform (app-cluster)
 *     └── web-workload  — cluster dep auto-wired
 *     └── api-workload  — cluster dep auto-wired
 *
 *   VirtualNetwork (main-network)
 *     └── SecurityGroup — inbound: TCP 80 (public), TCP 8080 (internal)
 *     └── Subnet        — private subnet
 *         └── web-workload — subnet dep stacked on cluster dep
 *         └── api-workload — subnet dep stacked on cluster dep
 *
 * Network rules:
 *   web-workload → api-workload on port 8080 (agent derives SG egress/ingress)
 *   Both workloads link to the shared security group for membership
 *
 * No cloud-provider details appear here — the blueprint can be satisfied
 * by any cloud provider that supports container workloads (ECS, EKS, etc.).
 */

import {
  BoundedContext,
  ContainerPlatform,
  Fractal,
  KebabCaseString,
  OwnerId,
  OwnerType,
  SecurityGroup,
  Subnet,
  Version,
  VirtualNetwork,
  Workload,
} from '@fractal_cloud/sdk';

// ── Bounded Context ────────────────────────────────────────────────────────────

export const bcId = BoundedContext.Id.getBuilder()
  .withOwnerType(OwnerType.Personal)
  .withOwnerId(OwnerId.getBuilder().withValue(process.env['OWNER_ID']!).build())
  .withName(KebabCaseString.getBuilder().withValue('wizard').build())
  .build();

// ── Security Group ─────────────────────────────────────────────────────────────

const appSg = SecurityGroup.create({
  id: 'app-sg',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Application Security Group',
  description: 'Allows public HTTP on 80 and internal API traffic on 8080',
  ingressRules: [
    {protocol: 'tcp', fromPort: 80, toPort: 80, sourceCidr: '0.0.0.0/0'},
    {
      protocol: 'tcp',
      fromPort: 8080,
      toPort: 8080,
      sourceCidr: '10.0.0.0/16',
    },
  ],
});

// ── Workloads ─────────────────────────────────────────────────────────────────

const apiWorkload = Workload.create({
  id: 'api-workload',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'API Workload',
  description: 'Backend API — listens on port 8080',
  containerImage: 'public.ecr.aws/amazonlinux/amazonlinux:latest',
  containerPort: 8080,
  cpu: '512',
  memory: '1024',
  desiredCount: 2,
}).withSecurityGroups([appSg]);

const webWorkload = Workload.create({
  id: 'web-workload',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Web Workload',
  description: 'Nginx frontend — serves on port 80, proxies to API on 8080',
  containerImage: 'nginx:alpine',
  containerPort: 80,
  cpu: '256',
  memory: '512',
  desiredCount: 2,
})
  .withLinks([{target: apiWorkload, fromPort: 8080, protocol: 'tcp'}])
  .withSecurityGroups([appSg]);

// ── Container Platform (cluster dep auto-wired into each workload) ─────────────

const containerPlatform = ContainerPlatform.create({
  id: 'app-cluster',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Application Cluster',
  description: 'Container platform hosting the web and API workloads',
}).withWorkloads([webWorkload, apiWorkload]);

// ── Network (subnet dep stacked on cluster dep via withWorkloads) ──────────────

const network = VirtualNetwork.create({
  id: 'main-network',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Main Network',
  description: 'Primary network for the container workload',
  cidrBlock: '10.0.0.0/16',
})
  .withSubnets([
    Subnet.create({
      id: 'private-subnet',
      version: {major: 1, minor: 0, patch: 0},
      displayName: 'Private Subnet',
      description: 'Private subnet — containers run here with no public IPs',
      cidrBlock: '10.0.1.0/24',
    }).withWorkloads(containerPlatform.workloads),
  ])
  .withSecurityGroups([appSg]);

// ── Fractal ────────────────────────────────────────────────────────────────────

export const fractal = Fractal.getBuilder()
  .withId(
    Fractal.Id.getBuilder()
      .withBoundedContextId(bcId)
      .withName(
        KebabCaseString.getBuilder()
          .withValue('basic-container-platform')
          .build(),
      )
      .withVersion(
        Version.getBuilder().withMajor(1).withMinor(0).withPatch(0).build(),
      )
      .build(),
  )
  .withComponents([
    // Container platform (standalone, region-level — no VPC dep)
    containerPlatform.platform,
    // Network hierarchy: VPC, subnet, SG, and workloads (cluster + subnet deps)
    ...network.components,
  ])
  .build();
