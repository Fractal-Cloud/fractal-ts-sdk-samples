/**
 * gcp_live_system.ts
 *
 * Satisfies the basic big data Fractal with GCP-specific components:
 *   - GcpDatabricks              satisfies DistributedDataProcessing
 *   - GcpDatabricksCluster       satisfies ComputeCluster
 *   - GcpDatabricksJob           satisfies DataProcessingJob
 *   - GcpDatabricksMlflow        satisfies MlExperiment
 *
 * Structural properties — dependencies — are all locked in the blueprint
 * and carried over automatically by satisfy(). Only GCP-specific
 * parameters are set here.
 *
 * Environment variables:
 *   GCP_DATABRICKS_NETWORK_ID – (optional) GCP network ID for Databricks
 */

import {
  GcpDatabricks,
  GcpDatabricksCluster,
  GcpDatabricksJob,
  GcpDatabricksMlflow,
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
  const networkId = process.env['GCP_DATABRICKS_NETWORK_ID'];

  // ── Databricks Workspace — satisfies DistributedDataProcessing ────────────

  const gcpPlatformBuilder = GcpDatabricks.satisfy(platform.platform)
    .withPricingTier('premium');

  if (networkId) gcpPlatformBuilder.withNetworkId(networkId);

  const gcpPlatform = gcpPlatformBuilder.build();

  // ── Databricks Cluster — satisfies ComputeCluster ─────────────────────────
  // Platform dependency is auto-wired from the blueprint.

  const gcpCluster = GcpDatabricksCluster.satisfy(bp('spark-cluster'))
    .withNodeTypeId('n1-standard-4')
    .build();

  // ── Databricks Job — satisfies DataProcessingJob ──────────────────────────
  // Platform dependency is auto-wired from the blueprint.

  const gcpJob = GcpDatabricksJob.satisfy(bp('etl-job')).build();

  // ── Databricks MLflow — satisfies MlExperiment ────────────────────────────
  // Platform dependency is auto-wired from the blueprint.

  const gcpMlflow = GcpDatabricksMlflow.satisfy(bp('training-exp')).build();

  // ── Live System ─────────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-big-data-gcp')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'BigData workload on GCP — Databricks workspace with cluster, job, and MLflow',
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
    .withComponent(gcpPlatform)
    .withComponent(gcpCluster)
    .withComponent(gcpJob)
    .withComponent(gcpMlflow)
    .build();
}
