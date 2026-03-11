/**
 * gcp_live_system.ts
 *
 * Satisfies the basic container platform Fractal with GCP-specific components:
 *   - GcpVpc              satisfies VirtualNetwork
 *   - GcpSubnet           satisfies Subnet
 *   - GcpFirewall         satisfies SecurityGroup (ingress rules from blueprint)
 *   - GcpGkeCluster       satisfies ContainerPlatform (required for blueprint completeness)
 *   - GcpCloudRunService  satisfies each Workload (containerImage, port, cpu, memory from blueprint)
 *
 * GCP Cloud Run is serverless — the GKE cluster satisfies the blueprint
 * ContainerPlatform for server-side validation. Cloud Run services carry their
 * container image, port, cpu, memory, dependencies, and links automatically
 * from the blueprint via satisfy().
 *
 * Environment variables:
 *   GCP_REGION  – (optional) GCP region, default "europe-west1"
 */

import {
  GcpCloudRunService,
  GcpFirewall,
  GcpGkeCluster,
  GcpSubnet,
  GcpVpc,
  Environment,
  KebabCaseString,
  LiveSystem,
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
  const region = process.env['GCP_REGION'] ?? 'europe-west1';

  // ── Network ──────────────────────────────────────────────────────────────────

  const gcpVpc = GcpVpc.satisfy(bp('main-network')).build();

  const gcpSubnet = GcpSubnet.satisfy(bp('private-subnet'))
    .withRegion(region)
    .build();

  // Ingress rules (port 80 + port 8080) are carried from the blueprint automatically
  const gcpFirewall = GcpFirewall.satisfy(bp('app-sg')).build();

  // ── GKE Cluster — satisfies the blueprint ContainerPlatform ──────────────────
  // Cloud Run is serverless; this satisfies the ContainerPlatform blueprint
  // component for server-side validation.

  const gcpCluster = GcpGkeCluster.satisfy(bp('app-cluster')).build();

  // ── Cloud Run Services — satisfy Workload blueprints ─────────────────────────
  // containerImage → image, containerPort → port, cpu, memory, dependencies,
  // and links are all carried from the blueprint automatically.

  const gcpWebService = GcpCloudRunService.satisfy(bp('web-workload'))
    .withRegion(region)
    .withIngress('all')
    .build();

  const gcpApiService = GcpCloudRunService.satisfy(bp('api-workload'))
    .withRegion(region)
    .withIngress('internal')
    .build();

  // ── Live System ───────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-container-platform-gcp')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'Two-tier container workload on GCP Cloud Run (VPC + Subnet + Firewall + GKE + 2 Cloud Run Services)',
    )
    .withGenericProvider('GCP')
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
    .withComponent(gcpVpc)
    .withComponent(gcpSubnet)
    .withComponent(gcpFirewall)
    .withComponent(gcpCluster)
    .withComponent(gcpWebService)
    .withComponent(gcpApiService)
    .build();
}
