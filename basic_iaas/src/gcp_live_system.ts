/**
 * gcp_live_system.ts
 *
 * Satisfies the basic IaaS Fractal with GCP-specific components:
 *   - GcpVpc            satisfies VirtualNetwork
 *   - GcpSubnet         satisfies Subnet  (adds region)
 *   - GcpFirewall       satisfies SecurityGroup (ingress rules from blueprint)
 *   - GcpVm             satisfies VirtualMachine (adds machine type, zone, image)
 *
 * All structural decisions are locked in the blueprint.
 */

import {
  GcpVpc,
  GcpSubnet,
  GcpFirewall,
  GcpVm,
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
  // ── GCP components ─────────────────────────────────────────────────────────────

  const gcpVpc = GcpVpc.satisfy(bp('main-network'))
    .withAutoCreateSubnetworks(false)
    .withRoutingMode('REGIONAL')
    .build();

  const gcpSubnet = GcpSubnet.satisfy(bp('public-subnet'))
    .withRegion(process.env['GCP_REGION'] ?? 'europe-west1')
    .build();

  const gcpFirewall = GcpFirewall.satisfy(bp('web-sg')).build();

  const gcpWebVm = GcpVm.satisfy(bp('web-server'))
    .withMachineType(process.env['GCP_MACHINE_TYPE'] ?? 'e2-micro')
    .withZone(process.env['GCP_ZONE'] ?? 'europe-west1-b')
    .withImageProject('debian-cloud')
    .withImageFamily('debian-12')
    .build();

  const gcpApiVm = GcpVm.satisfy(bp('api-server'))
    .withMachineType(process.env['GCP_MACHINE_TYPE'] ?? 'e2-micro')
    .withZone(process.env['GCP_ZONE'] ?? 'europe-west1-b')
    .withImageProject('debian-cloud')
    .withImageFamily('debian-12')
    .build();

  // ── Live System ────────────────────────────────────────────────────────────────

  const liveSystem = LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder().withValue('basic-iaas-gcp').build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'Basic IaaS workload deployed on GCP (VPC + Subnet + Firewall + VMs)',
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
    .withComponent(gcpWebVm)
    .withComponent(gcpApiVm)
    .build();

  return liveSystem;
}
