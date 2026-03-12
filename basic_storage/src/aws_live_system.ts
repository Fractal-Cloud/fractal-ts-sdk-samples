/**
 * aws_live_system.ts
 *
 * Satisfies the basic storage Fractal with AWS-specific components:
 *   - AwsS3  satisfies FilesAndBlobs (adds bucket name, versioning)
 *
 * AWS does not yet have an RDS offer in the SDK, so only the object
 * storage component is mapped. The DBMS and database blueprint
 * components are not satisfied in this provider.
 *
 * Environment variables:
 *   S3_BUCKET_NAME  – (optional) S3 bucket name
 */

import {
  AwsS3,
  Environment,
  KebabCaseString,
  LiveSystem,
  OwnerId,
  OwnerType,
} from '@fractal_cloud/sdk';
import {bcId, fractal, appStorage} from './fractal';

export function getLiveSystem(): LiveSystem {
  // ── S3 — satisfies FilesAndBlobs ────────────────────────────────────────────

  const s3 = AwsS3.satisfy(appStorage.component)
    .withBucket(process.env['S3_BUCKET_NAME'] ?? 'my-app-storage-bucket')
    .withVersioningEnabled(true)
    .build();

  // ── Live System ─────────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-storage-aws')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'Storage workload on AWS — S3 bucket for object storage',
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
    .withComponent(s3)
    .build();
}
