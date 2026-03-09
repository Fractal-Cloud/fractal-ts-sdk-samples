/**
 * oci_live_system.ts
 *
 * Satisfies the basic IaaS Fractal with OCI-specific components:
 *   - OciVcn            satisfies VirtualNetwork
 *   - OciSubnet         satisfies Subnet  (adds compartment, availability domain)
 *   - OciSecurityList   satisfies SecurityGroup (ingress rules from blueprint)
 *   - OciInstance       satisfies VirtualMachine (adds shape, image, compartment)
 *
 * All structural decisions are locked in the blueprint.
 */

import {
  OciVcn,
  OciSubnet,
  OciSecurityList,
  OciInstance,
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
  // ── OCI components ─────────────────────────────────────────────────────────────

  const ociVcn = OciVcn.satisfy(bp('main-network'))
    .withCompartmentId(process.env['OCI_COMPARTMENT_ID']!)
    .build();

  const ociSubnet = OciSubnet.satisfy(bp('public-subnet'))
    .withCompartmentId(process.env['OCI_COMPARTMENT_ID']!)
    .withAvailabilityDomain(process.env['OCI_AVAILABILITY_DOMAIN'] ?? 'AD-1')
    .build();

  const ociSecurityList = OciSecurityList.satisfy(bp('web-sg'))
    .withCompartmentId(process.env['OCI_COMPARTMENT_ID']!)
    .build();

  const ociWebInstance = OciInstance.satisfy(bp('web-server'))
    .withCompartmentId(process.env['OCI_COMPARTMENT_ID']!)
    .withAvailabilityDomain(process.env['OCI_AVAILABILITY_DOMAIN'] ?? 'AD-1')
    .withShape(process.env['OCI_SHAPE'] ?? 'VM.Standard.E4.Flex')
    .withImageId(process.env['OCI_IMAGE_ID']!)
    .withOcpus(1)
    .withMemoryInGbs(16)
    .build();

  const ociApiInstance = OciInstance.satisfy(bp('api-server'))
    .withCompartmentId(process.env['OCI_COMPARTMENT_ID']!)
    .withAvailabilityDomain(process.env['OCI_AVAILABILITY_DOMAIN'] ?? 'AD-1')
    .withShape(process.env['OCI_SHAPE'] ?? 'VM.Standard.E4.Flex')
    .withImageId(process.env['OCI_IMAGE_ID']!)
    .withOcpus(1)
    .withMemoryInGbs(16)
    .build();

  // ── Live System ────────────────────────────────────────────────────────────────

  const liveSystem = LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder().withValue('basic-iaas-oci').build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'Basic IaaS workload deployed on OCI (VCN + Subnet + Security List + Compute)',
    )
    .withGenericProvider('OCI')
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
    .withComponent(ociVcn)
    .withComponent(ociSubnet)
    .withComponent(ociSecurityList)
    .withComponent(ociWebInstance)
    .withComponent(ociApiInstance)
    .build();

  return liveSystem;
}
