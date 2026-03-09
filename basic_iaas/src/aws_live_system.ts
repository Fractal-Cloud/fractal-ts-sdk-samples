/**
 * aws_live_system.ts
 *
 * Satisfies the basic IaaS Fractal with AWS-specific components:
 *   - AwsVpc          satisfies VirtualNetwork
 *   - AwsSubnet       satisfies Subnet  (adds availability zone)
 *   - AwsSecurityGroup satisfies SecurityGroup (adds ingress rules)
 *   - Ec2Instance     satisfies VirtualMachine (adds AMI, instance type, etc.)
 *
 * Components depend on each other following the agent contract:
 *   Subnet   → depends on VPC
 *   SecGroup → depends on VPC
 *   EC2      → depends on Subnet
 */

import {
  AwsVpc,
  AwsSubnet,
  AwsSecurityGroup,
  Ec2Instance,
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
  // ── AWS components ─────────────────────────────────────────────────────────────

  const awsVpc = AwsVpc.satisfy(bp('main-network'))
    .withEnableDnsSupport(true)
    .withEnableDnsHostnames(true)
    .build();

  const awsSubnet = AwsSubnet.satisfy(bp('public-subnet'))
    .withAvailabilityZone('eu-central-1a')
    .build();

  const awsSecurityGroup = AwsSecurityGroup.satisfy(bp('web-sg')).build();

  const ec2WebServer = Ec2Instance.satisfy(bp('web-server'))
    .withAmiId('ami-0c55b159cbfafe1f0') // Amazon Linux 2 (eu-central-1)
    .withInstanceType('t3.micro')
    .withKeyName(process.env['EC2_KEY_NAME'] ?? 'default-key')
    .withAssociatePublicIp(true)
    .build();

  const ec2ApiServer = Ec2Instance.satisfy(bp('api-server'))
    .withAmiId('ami-0c55b159cbfafe1f0')
    .withInstanceType('t3.small')
    .withKeyName(process.env['EC2_KEY_NAME'] ?? 'default-key')
    .withAssociatePublicIp(false)
    .build();

  // ── Live System ────────────────────────────────────────────────────────────────

  const liveSystem = LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder().withValue('basic-iaas-aws').build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'Basic IaaS workload deployed on AWS (VPC + Subnet + SG + EC2)',
    )
    .withGenericProvider('AWS')
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
    .withComponent(awsVpc)
    .withComponent(awsSubnet)
    .withComponent(awsSecurityGroup)
    .withComponent(ec2WebServer)
    .withComponent(ec2ApiServer)
    .build();

  return liveSystem;
}
