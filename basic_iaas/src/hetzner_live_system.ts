/**
 * hetzner_live_system.ts
 *
 * Satisfies the basic IaaS Fractal with Hetzner-specific components:
 *   - HetznerNetwork    satisfies VirtualNetwork
 *   - HetznerSubnet     satisfies Subnet  (adds network zone)
 *   - HetznerFirewall   satisfies SecurityGroup (ingress rules from blueprint)
 *   - HetznerServer     satisfies VirtualMachine (adds server type, location, image)
 *
 * All structural decisions are locked in the blueprint.
 */

import {
  HetznerNetwork,
  HetznerSubnet,
  HetznerFirewall,
  HetznerServer,
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
  // ── Hetzner components ─────────────────────────────────────────────────────────

  const hetznerNetwork = HetznerNetwork.satisfy(bp('main-network')).build();

  const hetznerSubnet = HetznerSubnet.satisfy(bp('public-subnet'))
    .withNetworkZone(process.env['HETZNER_NETWORK_ZONE'] ?? 'eu-central')
    .build();

  const hetznerFirewall = HetznerFirewall.satisfy(bp('web-sg')).build();

  const hetznerWebServer = HetznerServer.satisfy(bp('web-server'))
    .withServerType(process.env['HETZNER_SERVER_TYPE'] ?? 'cx22')
    .withLocation(process.env['HETZNER_LOCATION'] ?? 'nbg1')
    .withImage(process.env['HETZNER_IMAGE'] ?? 'ubuntu-24.04')
    .build();

  const hetznerApiServer = HetznerServer.satisfy(bp('api-server'))
    .withServerType(process.env['HETZNER_SERVER_TYPE'] ?? 'cx22')
    .withLocation(process.env['HETZNER_LOCATION'] ?? 'nbg1')
    .withImage(process.env['HETZNER_IMAGE'] ?? 'ubuntu-24.04')
    .build();

  // ── Live System ────────────────────────────────────────────────────────────────

  const liveSystem = LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder().withValue('basic-iaas-hetzner').build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'Basic IaaS workload deployed on Hetzner (Network + Subnet + Firewall + Servers)',
    )
    .withGenericProvider('Hetzner')
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
    .withComponent(hetznerNetwork)
    .withComponent(hetznerSubnet)
    .withComponent(hetznerFirewall)
    .withComponent(hetznerWebServer)
    .withComponent(hetznerApiServer)
    .build();

  return liveSystem;
}
