/**
 * openshift_live_system.ts
 *
 * Satisfies the on-prem OpenShift Fractal with all available OpenShift components:
 *   - OpenshiftSecurityGroup    satisfies SecurityGroup   (NetworkPolicy)
 *   - OpenshiftWorkload ×2      satisfies Workload        (Deployments)
 *   - OpenshiftService          satisfies LoadBalancer     (Service + Route)
 *   - OpenshiftPersistentVolume satisfies FilesAndBlobs    (PV + PVC)
 *   - OpenshiftVm               satisfies VirtualMachine   (KubeVirt VM)
 *
 * Structural properties — dependencies, links, container images, cpu, memory,
 * desiredCount, ingressRules — are locked in the blueprint and carried over
 * automatically by satisfy(). Only OpenShift-specific parameters are set here.
 *
 * Environment variables:
 *   OPENSHIFT_NAMESPACE    – Kubernetes namespace (default "app")
 *   OPENSHIFT_STORAGE_CLASS – StorageClass name (default "gp3-csi")
 *   OPENSHIFT_ROUTE_HOSTNAME – (optional) Route hostname for the web service
 *   OPENSHIFT_VM_IMAGE     – (optional) VM base image (default "registry.redhat.io/rhel9/rhel-guest-image:latest")
 *   OPENSHIFT_SSH_PUBLIC_KEY – (optional) SSH public key for VM access
 */

import {
  Environment,
  KebabCaseString,
  LiveSystem,
  OpenshiftPersistentVolume,
  OpenshiftSecurityGroup,
  OpenshiftService,
  OpenshiftVm,
  OpenshiftWorkload,
  OwnerId,
  OwnerType,
} from '@fractal_cloud/sdk';
import {bcId, fractal} from './fractal';

// Retrieve blueprint components by ID
function bp(id: string) {
  const c = fractal.components.find(x => x.id.toString() === id);
  if (!c) throw new Error(`Blueprint component '${id}' not found`);
  return c;
}

export function getLiveSystem(): LiveSystem {
  const namespace = process.env['OPENSHIFT_NAMESPACE'] ?? 'app';
  const storageClass = process.env['OPENSHIFT_STORAGE_CLASS'] ?? 'gp3-csi';

  // ── Network Policy ────────────────────────────────────────────────────────────
  // Ingress rules are carried from the blueprint automatically.

  const networkPolicy = OpenshiftSecurityGroup.satisfy(bp('app-network-policy'))
    .withName('app-network-policy')
    .withPolicyType('Ingress')
    .withPodSelector('app=web')
    .build();

  // ── Workloads ─────────────────────────────────────────────────────────────────
  // containerImage, containerPort, cpu, memory, desiredCount, links, and SG
  // membership are carried from the blueprint automatically.

  const apiWorkload = OpenshiftWorkload.satisfy(bp('api-workload'))
    .withName('api-workload')
    .withNamespace(namespace)
    .withWorkloadType('Deployment')
    .withCpuLimit('1000')
    .withMemoryLimit('2048')
    .build();

  const webWorkload = OpenshiftWorkload.satisfy(bp('web-workload'))
    .withName('web-workload')
    .withNamespace(namespace)
    .withWorkloadType('Deployment')
    .withCpuLimit('500')
    .withMemoryLimit('1024')
    .build();

  // ── Service + Route ───────────────────────────────────────────────────────────

  const serviceBuilder = OpenshiftService.satisfy(bp('web-service'))
    .withName('web-service')
    .withNamespace(namespace)
    .withWorkloadName('web-workload')
    .withPort(80)
    .withTargetPort(80)
    .withProtocol('TCP')
    .withServiceType('ClusterIP')
    .withCreateRoute(true)
    .withRouteTlsTermination('edge');
  if (process.env['OPENSHIFT_ROUTE_HOSTNAME'])
    serviceBuilder.withRouteHostname(process.env['OPENSHIFT_ROUTE_HOSTNAME']);
  const webService = serviceBuilder.build();

  // ── Persistent Volume ─────────────────────────────────────────────────────────

  const persistentVolume = OpenshiftPersistentVolume.satisfy(bp('app-storage'))
    .withName('app-storage-pv')
    .withNamespace(namespace)
    .withStorageSize('10Gi')
    .withStorageClassName(storageClass)
    .withAccessMode('ReadWriteOnce')
    .build();

  // ── Virtual Machine (OpenShift Virtualization / KubeVirt) ─────────────────────

  const vmBuilder = OpenshiftVm.satisfy(bp('legacy-vm'))
    .withName('legacy-vm')
    .withImage(
      process.env['OPENSHIFT_VM_IMAGE'] ??
        'registry.redhat.io/rhel9/rhel-guest-image:latest',
    )
    .withNamespace(namespace)
    .withCpuCores(2)
    .withMemorySizeGi('4Gi')
    .withDiskSizeGi('40Gi')
    .withStorageClassName(storageClass)
    .withRunStrategy('Always');
  if (process.env['OPENSHIFT_SSH_PUBLIC_KEY'])
    vmBuilder.withSshPublicKey(process.env['OPENSHIFT_SSH_PUBLIC_KEY']);
  const legacyVm = vmBuilder.build();

  // ── Live System ───────────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-onprem-openshift')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'On-prem OpenShift workload (NetworkPolicy + 2 Workloads + Service + PV + VM)',
    )
    .withGenericProvider('RedHat')
    .withEnvironment(
      Environment.getBuilder()
        .withId(
          Environment.Id.getBuilder()
            .withOwnerType(OwnerType.Personal)
            .withOwnerId(
              OwnerId.getBuilder().withValue(process.env['OWNER_ID']!).build(),
            )
            .withName(
              KebabCaseString.getBuilder()
                .withValue(process.env['ENVIRONMENT_NAME'] ?? 'dev')
                .build(),
            )
            .build(),
        )
        .build(),
    )
    .withComponent(networkPolicy)
    .withComponent(apiWorkload)
    .withComponent(webWorkload)
    .withComponent(webService)
    .withComponent(persistentVolume)
    .withComponent(legacyVm)
    .build();
}
