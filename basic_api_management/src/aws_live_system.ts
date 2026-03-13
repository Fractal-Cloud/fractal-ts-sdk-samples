/**
 * aws_live_system.ts
 *
 * Satisfies the basic API management Fractal with AWS-specific components:
 *   - AwsCloudFront satisfies PaaSApiGateway
 *
 * Structural properties are all locked in the blueprint and carried over
 * automatically by satisfy(). Only AWS-specific parameters are set here.
 */

import {
  AwsCloudFront,
  Environment,
  KebabCaseString,
  LiveSystem,
  OwnerId,
  OwnerType,
} from '@fractal_cloud/sdk';
import {bcId, fractal, gateway} from './fractal';

export function getLiveSystem(): LiveSystem {
  // ── CloudFront — satisfies PaaSApiGateway ──────────────────────────────────

  const awsGateway = AwsCloudFront.satisfy(gateway.component)
    .withAwsRegion('us-east-1')
    .withApiKeySource('HEADER')
    .build();

  // ── Live System ───────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-api-management-aws')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription('API Management on AWS — CloudFront API Gateway')
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
    .withComponent(awsGateway)
    .build();
}
