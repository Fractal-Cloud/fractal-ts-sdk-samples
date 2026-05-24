/**
 * fractal.ts
 *
 * Defines a cloud-agnostic Fractal (blueprint) for an OpenShift workload
 * showcasing all available OpenShift component types:
 *
 *   SecurityGroup (app-network-policy)
 *     — ingress rules: TCP 80 (public), TCP 8080 (internal)
 *
 *   Workload (api-workload) — backend API, linked to SG
 *   Workload (web-workload) — nginx frontend, linked to SG + traffic rule to API
 *
 *   LoadBalancer (web-service) — exposes the web frontend
 *
 *   FilesAndBlobs (app-storage) — persistent volume for application data
 *
 *   VirtualMachine (legacy-vm) — VM via OpenShift Virtualization
 *
 * No OpenShift-specific details appear here — the blueprint can be satisfied
 * by any provider that supports these component types.
 */

import {
  BoundedContext,
  FilesAndBlobs,
  Fractal,
  KebabCaseString,
  LoadBalancer,
  OwnerId,
  OwnerType,
  SecurityGroup,
  Version,
  VirtualMachine,
  Workload,
} from '@fractal_cloud/sdk';

// ── Bounded Context ────────────────────────────────────────────────────────────

export const bcId = BoundedContext.Id.getBuilder()
  .withOwnerType(OwnerType.Organizational)
  .withOwnerId(OwnerId.getBuilder().withValue(process.env['OWNER_ID']!).build())
  .withName(KebabCaseString.getBuilder().withValue(process.env['BC_NAME'] ?? 'test-rg').build())
  .build();

// ── Security Group (NetworkPolicy) ─────────────────────────────────────────────

const appNetworkPolicy = SecurityGroup.create({
  id: 'app-network-policy',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Application Network Policy',
  description:
    'Controls pod-to-pod traffic — allows HTTP on 80 and API on 8080',
  ingressRules: [
    {protocol: 'tcp', fromPort: 80, toPort: 80, sourceCidr: '0.0.0.0/0'},
    {
      protocol: 'tcp',
      fromPort: 8080,
      toPort: 8080,
      sourceCidr: '10.128.0.0/14',
    },
  ],
});

// ── Workloads ──────────────────────────────────────────────────────────────────

const apiWorkload = Workload.create({
  id: 'api-workload',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'API Workload',
  description: 'Backend API — listens on port 8080',
  containerImage: 'registry.redhat.io/ubi9/httpd-24:latest',
  containerPort: 8080,
  cpu: '500',
  memory: '1024',
  desiredCount: 2,
}).linkToSecurityGroup([appNetworkPolicy]);

const webWorkload = Workload.create({
  id: 'web-workload',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Web Workload',
  description: 'Nginx frontend — serves on port 80, proxies to API on 8080',
  containerImage: 'nginx:alpine',
  containerPort: 80,
  cpu: '250',
  memory: '512',
  desiredCount: 2,
})
  .linkToWorkload([{target: apiWorkload, fromPort: 8080, protocol: 'tcp'}])
  .linkToSecurityGroup([appNetworkPolicy]);

// ── Load Balancer (OpenShift Service + Route) ──────────────────────────────────

const webService = LoadBalancer.create({
  id: 'web-service',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Web Service',
  description:
    'OpenShift Service and Route exposing the web frontend externally',
});

// ── Storage (Persistent Volume) ────────────────────────────────────────────────

export const appStorage = FilesAndBlobs.create({
  id: 'app-storage',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Application Storage',
  description: 'Persistent volume for application data and uploads',
});

// ── Virtual Machine (OpenShift Virtualization) ─────────────────────────────────

const legacyVm = VirtualMachine.create({
  id: 'legacy-vm',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Legacy VM',
  description:
    'Legacy application running on OpenShift Virtualization (KubeVirt)',
});

// ── Fractal ────────────────────────────────────────────────────────────────────

export const fractal = Fractal.getBuilder()
  .withId(
    Fractal.Id.getBuilder()
      .withBoundedContextId(bcId)
      .withName(
        KebabCaseString.getBuilder()
          .withValue('basic-onprem-openshift')
          .build(),
      )
      .withVersion(
        Version.getBuilder().withMajor(1).withMinor(0).withPatch(0).build(),
      )
      .build(),
  )
  .withComponents([
    appNetworkPolicy,
    apiWorkload.component,
    webWorkload.component,
    webService.component,
    appStorage.component,
    legacyVm.component,
  ])
  .build();
