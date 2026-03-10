/**
 * aws_live_system.ts
 *
 * Satisfies the basic container platform Fractal with AWS-specific components:
 *   - AwsVpc                 satisfies VirtualNetwork
 *   - AwsSubnet              satisfies Subnet  (adds availability zone)
 *   - AwsSecurityGroup       satisfies SecurityGroup (ingress rules from blueprint)
 *   - AwsEcsCluster          satisfies ContainerPlatform
 *   - AwsEcsTaskDefinition   satisfies each Workload (ID: <workload-id>-task, adds IAM role ARNs)
 *   - AwsEcsService          satisfies each Workload (ID: <workload-id>, adds launch type)
 *
 * Structural properties — dependencies, links, desiredCount, containerImage,
 * cpu, memory, ingressRules — are all locked in the blueprint and carried over
 * automatically by satisfy(). Only AWS-specific parameters are set here.
 */

import {
  AwsEcsCluster,
  AwsEcsService,
  AwsEcsTaskDefinition,
  AwsSecurityGroup,
  AwsSubnet,
  AwsVpc,
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

// ── Network ────────────────────────────────────────────────────────────────────

const awsVpc = AwsVpc.satisfy(bp('main-network'))
  .withEnableDnsSupport(true)
  .withEnableDnsHostnames(true)
  .build();

const awsSubnet = AwsSubnet.satisfy(bp('private-subnet'))
  .withAvailabilityZone('eu-central-1a')
  .build();

// Ingress rules (port 80 + port 8080) are carried from the blueprint automatically
const awsSecurityGroup = AwsSecurityGroup.satisfy(bp('app-sg')).build();

// ── ECS Cluster — satisfies the blueprint ContainerPlatform ───────────────────

const awsCluster = AwsEcsCluster.satisfy(bp('app-cluster')).build();

// ── Task Definitions — satisfy Workload blueprint, add IAM role ARNs ──────────
// containerImage, cpu, memory, containerPort are locked from the blueprint.
// ID is <workload-id>-task to avoid collision with the service component.

const awsWebTask = AwsEcsTaskDefinition.satisfy(bp('web-workload'))
  .withNetworkMode('awsvpc')
  .withExecutionRoleArn(
    process.env['ECS_EXECUTION_ROLE_ARN'] ??
      'arn:aws:iam::123456789012:role/ecsTaskExecutionRole',
  )
  .build();

const awsApiTask = AwsEcsTaskDefinition.satisfy(bp('api-workload'))
  .withNetworkMode('awsvpc')
  .withExecutionRoleArn(
    process.env['ECS_EXECUTION_ROLE_ARN'] ??
      'arn:aws:iam::123456789012:role/ecsTaskExecutionRole',
  )
  .withTaskRoleArn(
    process.env['ECS_TASK_ROLE_ARN'] ??
      'arn:aws:iam::123456789012:role/ecsApiTaskRole',
  )
  .build();

// ── ECS Services — satisfy Workload blueprint, add Fargate launch params ───────
// desiredCount, links (traffic rules), SG membership, subnet dep, and cluster
// dep are all carried from the blueprint automatically.
// withTaskDefinition() adds the AWS-specific sub-component dependency.

const awsWebService = AwsEcsService.satisfy(bp('web-workload'))
  .withLaunchType('FARGATE')
  .withAssignPublicIp(false)
  .withTaskDefinition(awsWebTask)
  .build();

const awsApiService = AwsEcsService.satisfy(bp('api-workload'))
  .withLaunchType('FARGATE')
  .withAssignPublicIp(false)
  .withTaskDefinition(awsApiTask)
  .build();

// ── Live System ────────────────────────────────────────────────────────────────

export const liveSystem = LiveSystem.getBuilder()
  .withId(
    LiveSystem.Id.getBuilder()
      .withBoundedContextId(bcId)
      .withName(
        KebabCaseString.getBuilder()
          .withValue('basic-container-platform-aws')
          .build(),
      )
      .build(),
  )
  .withFractalId(fractal.id)
  .withDescription(
    'Two-tier container workload on AWS ECS Fargate (VPC + Subnet + SG + ECS Cluster + 2 Workloads)',
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
  .withComponent(awsCluster)
  .withComponent(awsWebTask)
  .withComponent(awsApiTask)
  .withComponent(awsWebService)
  .withComponent(awsApiService)
  .build();
