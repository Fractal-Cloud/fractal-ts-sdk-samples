/**
 * aws_live_system.ts
 *
 * Satisfies the basic CI/CD Fractal with AWS-specific components:
 *   - AwsVpc          satisfies VirtualNetwork
 *   - AwsSubnet       satisfies Subnet  (adds availability zone)
 *   - AwsSecurityGroup satisfies SecurityGroup
 *   - Ec2Instance     satisfies VirtualMachine (adds AMI, instance type, etc.)
 *
 * This file contains only vendor-specific parameters.
 * All structural wiring (dependencies, links, hierarchy) lives in fractal.ts.
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
    .withAvailabilityZone(process.env['AWS_AVAILABILITY_ZONE'] ?? 'eu-central-1a')
    .build();

  const awsSecurityGroup = AwsSecurityGroup.satisfy(bp('web-sg')).build();

  const webBuilder = Ec2Instance.satisfy(bp('web-server'))
    .withAmiId(process.env['EC2_AMI_ID'] ?? 'ami-0970102fe1454052a')
    .withInstanceType(process.env['EC2_INSTANCE_TYPE'] ?? 't3.micro')
    .withAssociatePublicIp(true);
  if (process.env['EC2_KEY_NAME']) webBuilder.withKeyName(process.env['EC2_KEY_NAME']);
  const ec2WebServer = webBuilder.build();

  const apiBuilder = Ec2Instance.satisfy(bp('api-server'))
    .withAmiId(process.env['EC2_AMI_ID'] ?? 'ami-0970102fe1454052a')
    .withInstanceType(process.env['EC2_INSTANCE_TYPE'] ?? 't3.small')
    .withAssociatePublicIp(false);
  if (process.env['EC2_KEY_NAME']) apiBuilder.withKeyName(process.env['EC2_KEY_NAME']);
  const ec2ApiServer = apiBuilder.build();

  // ── Live System ────────────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder().withValue('basic-cicd-aws').build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'Basic IaaS workload deployed on AWS via CI/CD pipeline (VPC + Subnet + SG + EC2)',
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
}
