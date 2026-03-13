/**
 * fractal.ts
 *
 * Defines a cloud-agnostic Fractal (blueprint) for a BigData workload:
 *
 *   DistributedDataProcessing (analytics-platform)
 *     ├── ComputeCluster (spark-cluster)     — platform dep auto-wired
 *     ├── DataProcessingJob (etl-job)        — platform dep auto-wired
 *     └── MlExperiment (training-exp)        — platform dep auto-wired
 *
 * The blueprint declares a Databricks workspace with a Spark cluster,
 * an ETL job, and an MLflow experiment.
 * No cloud-provider details appear here — the blueprint can be satisfied
 * by AWS, Azure, or GCP Databricks.
 */

import {
  BoundedContext,
  ComputeCluster,
  DataProcessingJob,
  DistributedDataProcessing,
  Fractal,
  KebabCaseString,
  MlExperiment,
  OwnerId,
  OwnerType,
  Version,
} from '@fractal_cloud/sdk';

// ── Bounded Context ────────────────────────────────────────────────────────────

export const bcId = BoundedContext.Id.getBuilder()
  .withOwnerType(OwnerType.Personal)
  .withOwnerId(OwnerId.getBuilder().withValue(process.env['OWNER_ID']!).build())
  .withName(KebabCaseString.getBuilder().withValue('wizard').build())
  .build();

// ── Children ───────────────────────────────────────────────────────────────────

const sparkCluster = ComputeCluster.create({
  id: 'spark-cluster',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Spark Cluster',
  clusterName: 'main-spark',
  sparkVersion: '14.3.x-scala2.12',
});

const etlJob = DataProcessingJob.create({
  id: 'etl-job',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'ETL Job',
  jobName: 'daily-etl',
  taskType: 'NOTEBOOK',
  notebookPath: '/jobs/daily-etl',
});

const trainingExp = MlExperiment.create({
  id: 'training-exp',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Training Experiment',
  experimentName: 'model-training',
});

// ── Platform (children deps auto-wired) ────────────────────────────────────────

export const platform = DistributedDataProcessing.create({
  id: 'analytics-platform',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Analytics Platform',
})
  .withClusters([sparkCluster])
  .withJobs([etlJob])
  .withExperiments([trainingExp]);

// ── Fractal ──────────────────────────────────────────────────────────────────

export const fractal = Fractal.getBuilder()
  .withId(
    Fractal.Id.getBuilder()
      .withBoundedContextId(bcId)
      .withName(
        KebabCaseString.getBuilder().withValue('basic-big-data').build(),
      )
      .withVersion(
        Version.getBuilder().withMajor(1).withMinor(0).withPatch(0).build(),
      )
      .build(),
  )
  .withComponents([
    platform.platform,
    ...platform.clusters.map(c => c.component),
    ...platform.jobs.map(j => j.component),
    ...platform.experiments.map(e => e.component),
  ])
  .build();
