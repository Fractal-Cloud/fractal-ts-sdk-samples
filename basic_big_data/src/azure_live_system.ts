/**
 * azure_live_system.ts
 *
 * Satisfies the basic big data Fractal with Azure-specific components:
 *   - AzureDatabricks              satisfies DistributedDataProcessing
 *   - AzureDatabricksCluster       satisfies ComputeCluster
 *   - AzureDatabricksJob           satisfies DataProcessingJob
 *   - AzureDatabricksMlflow        satisfies MlExperiment
 *
 * Structural properties — dependencies — are all locked in the blueprint
 * and carried over automatically by satisfy(). Only Azure-specific
 * parameters are set here.
 *
 * Environment variables:
 *   AZURE_MANAGED_RESOURCE_GROUP – (optional) managed resource group name
 *   AZURE_ENABLE_NO_PUBLIC_IP    – (optional) "true" to enable no public IP
 */

import {
  AzureDatabricks,
  AzureDatabricksCluster,
  AzureDatabricksJob,
  AzureDatabricksMlflow,
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
  const managedResourceGroupName =
    process.env['AZURE_MANAGED_RESOURCE_GROUP'] ?? 'my-managed-rg';
  const enableNoPublicIp =
    process.env['AZURE_ENABLE_NO_PUBLIC_IP'] === 'true';

  // ── Databricks Workspace — satisfies DistributedDataProcessing ────────────

  const azurePlatform = AzureDatabricks.satisfy(platform.platform)
    .withPricingTier('premium')
    .withManagedResourceGroupName(managedResourceGroupName)
    .withEnableNoPublicIp(enableNoPublicIp)
    .build();

  // ── Databricks Cluster — satisfies ComputeCluster ─────────────────────────
  // Platform dependency is auto-wired from the blueprint.

  const azureCluster = AzureDatabricksCluster.satisfy(bp('spark-cluster'))
    .withNodeTypeId('Standard_DS3_v2')
    .build();

  // ── Databricks Job — satisfies DataProcessingJob ──────────────────────────
  // Platform dependency is auto-wired from the blueprint.

  const azureJob = AzureDatabricksJob.satisfy(bp('etl-job')).build();

  // ── Databricks MLflow — satisfies MlExperiment ────────────────────────────
  // Platform dependency is auto-wired from the blueprint.

  const azureMlflow = AzureDatabricksMlflow.satisfy(
    bp('training-exp'),
  ).build();

  // ── Live System ─────────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-big-data-azure')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'BigData workload on Azure — Databricks workspace with cluster, job, and MLflow',
    )
    .withGenericProvider('Azure')
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
    .withComponent(azurePlatform)
    .withComponent(azureCluster)
    .withComponent(azureJob)
    .withComponent(azureMlflow)
    .build();
}
