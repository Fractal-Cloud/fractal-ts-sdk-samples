/**
 * aws_live_system.ts
 *
 * Satisfies the basic big data Fractal with AWS-specific components:
 *   - AwsDatabricks              satisfies DistributedDataProcessing
 *   - AwsDatabricksCluster       satisfies ComputeCluster
 *   - AwsDatabricksJob           satisfies DataProcessingJob
 *   - AwsDatabricksMlflow        satisfies MlExperiment
 *
 * Structural properties — dependencies — are all locked in the blueprint
 * and carried over automatically by satisfy(). Only AWS-specific
 * parameters are set here.
 *
 * Environment variables:
 *   AWS_DATABRICKS_CREDENTIALS_ID          – Databricks credentials ID
 *   AWS_DATABRICKS_STORAGE_CONFIGURATION_ID – Databricks storage configuration ID
 *   AWS_DATABRICKS_NETWORK_ID              – (optional) Databricks network ID
 */

import {
  AwsDatabricks,
  AwsDatabricksCluster,
  AwsDatabricksJob,
  AwsDatabricksMlflow,
  Environment,
  KebabCaseString,
  LiveSystem,
  OwnerId,
  OwnerType,
} from '@fractal_cloud/sdk';
import {bcId, fractal, platform} from './fractal';

// Retrieve blueprint components by ID
function bp(id: string) {
  const c = fractal.components.find(x => x.id.toString() === id);
  if (!c) throw new Error(`Blueprint component '${id}' not found`);
  return c;
}

export function getLiveSystem(): LiveSystem {
  const credentialsId =
    process.env['AWS_DATABRICKS_CREDENTIALS_ID'] ?? 'my-credentials';
  const storageConfigurationId =
    process.env['AWS_DATABRICKS_STORAGE_CONFIGURATION_ID'] ??
    'my-storage-config';
  const networkId = process.env['AWS_DATABRICKS_NETWORK_ID'];

  // ── Databricks Workspace — satisfies DistributedDataProcessing ────────────

  const awsPlatformBuilder = AwsDatabricks.satisfy(platform.platform)
    .withPricingTier('premium')
    .withCredentialsId(credentialsId)
    .withStorageConfigurationId(storageConfigurationId);

  if (networkId) awsPlatformBuilder.withNetworkId(networkId);

  const awsPlatform = awsPlatformBuilder.build();

  // ── Databricks Cluster — satisfies ComputeCluster ─────────────────────────
  // Platform dependency is auto-wired from the blueprint.

  const awsCluster = AwsDatabricksCluster.satisfy(bp('spark-cluster'))
    .withNodeTypeId('i3.xlarge')
    .build();

  // ── Databricks Job — satisfies DataProcessingJob ──────────────────────────
  // Platform dependency is auto-wired from the blueprint.

  const awsJob = AwsDatabricksJob.satisfy(bp('etl-job')).build();

  // ── Databricks MLflow — satisfies MlExperiment ────────────────────────────
  // Platform dependency is auto-wired from the blueprint.

  const awsMlflow = AwsDatabricksMlflow.satisfy(bp('training-exp')).build();

  // ── Live System ─────────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-big-data-aws')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'BigData workload on AWS — Databricks workspace with cluster, job, and MLflow',
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
    .withComponent(awsPlatform)
    .withComponent(awsCluster)
    .withComponent(awsJob)
    .withComponent(awsMlflow)
    .build();
}
