/**
 * index.ts — the DEV team consumes the governed Fractal.
 *
 * The dev never authors infrastructure. They (1) specialize the Fractal (here
 * there are no application-level operations, so `.specialize()` carries no extra
 * ops — guardrails are already locked in the blueprint), then (2) build a
 * LiveSystem by SELECTING, per component, one concrete offer from the open
 * Catalogue. Selection is the ONLY place a vendor is named, and the ONLY place
 * vendor knobs (amiId, vmSize, machineType, shape, serverType, ...) are supplied.
 *
 * Offer selection is per-component, so a single LiveSystem can mix vendors and
 * delivery models freely. The compiler enforces that each selected offer
 * satisfies the abstract Component in that slot.
 *
 * Future-proof: to retarget a component to a different vendor, swap that one
 * line in the `select` map below — the Fractal in fractal.ts is never touched.
 */
import {authorFractal} from './fractal';
import {
  deploy,
  // VirtualNetwork offers
  AwsVpc,
  AzureVnet,
  GcpVpc,
  OciVcn,
  HetznerNetwork,
  // Subnet offers
  AwsSubnet,
  AzureSubnet,
  GcpSubnet,
  OciSubnet,
  HetznerSubnet,
  // SecurityGroup offers
  AwsSecurityGroup,
  AzureNsg,
  GcpFirewall,
  OciSecurityList,
  HetznerFirewall,
  // VirtualMachine offers
  Ec2Instance,
  AzureVm,
  GcpVm,
  OciInstance,
  HetznerServer,
} from '@fractal_cloud/sdk/model';

type Provider = 'aws' | 'azure' | 'gcp' | 'oci' | 'hetzner';

const environment = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['ENVIRONMENT_NAME'] ?? 'dev',
};

/**
 * Per-component offer selection for a given vendor. Each entry maps a blueprint
 * component id to a concrete offer plus that offer's vendor config. The keys are
 * the blueprint component ids declared in fractal.ts. Swap any single line (or
 * the whole branch) to retarget — the Fractal stays untouched.
 */
function selectionFor(provider: Provider) {
  switch (provider) {
    case 'azure':
      return {
        'main-network': AzureVnet({}),
        'public-subnet': AzureSubnet({}),
        'web-sg': AzureNsg({location: 'westeurope', resourceGroup: 'rg-iaas'}),
        'api-server': AzureVm({vmSize: 'Standard_B1s'}),
        'web-server': AzureVm({vmSize: 'Standard_B1s'}),
      };
    case 'gcp':
      return {
        'main-network': GcpVpc({}),
        'public-subnet': GcpSubnet({}),
        'web-sg': GcpFirewall({}),
        'api-server': GcpVm({machineType: 'e2-micro'}),
        'web-server': GcpVm({machineType: 'e2-micro'}),
      };
    case 'oci':
      return {
        'main-network': OciVcn({}),
        'public-subnet': OciSubnet({}),
        'web-sg': OciSecurityList({
          compartmentId: process.env['OCI_COMPARTMENT_ID'] ?? '',
        }),
        'api-server': OciInstance({shape: 'VM.Standard.E4.Flex'}),
        'web-server': OciInstance({shape: 'VM.Standard.E4.Flex'}),
      };
    case 'hetzner':
      return {
        'main-network': HetznerNetwork({}),
        'public-subnet': HetznerSubnet({}),
        'web-sg': HetznerFirewall({}),
        'api-server': HetznerServer({serverType: 'cx22'}),
        'web-server': HetznerServer({serverType: 'cx22'}),
      };
    case 'aws':
    default:
      return {
        'main-network': AwsVpc({}),
        'public-subnet': AwsSubnet({}),
        'web-sg': AwsSecurityGroup({}),
        'api-server': Ec2Instance({
          amiId: 'ami-0abcdef1234567890',
          instanceType: 't3.micro',
        }),
        'web-server': Ec2Instance({
          amiId: 'ami-0abcdef1234567890',
          instanceType: 't3.micro',
        }),
      };
  }
}

async function main() {
  const provider = (process.env['CLOUD_PROVIDER'] ?? 'aws') as Provider;
  const select = selectionFor(provider);

  // 1. Specialize (no app-level ops here). Immutable: the authored Fractal is
  //    never mutated, so it stays reusable.
  // 2. Build the LiveSystem by selecting an offer per component.
  const ls = authorFractal().specialize().toLiveSystem({
    name: 'basic-iaas',
    environment,
    select,
  });

  // 3. Deploy: submit the LiveSystem and wait until Active (wait-mode logs).
  await deploy(
    ls,
    {
      clientId: process.env['SERVICE_ACCOUNT_ID']!,
      clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
    },
    {mode: 'wait'},
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
