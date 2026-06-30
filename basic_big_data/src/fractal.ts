/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * This is a vendor-AGNOSTIC Fractal: the blueprint references only abstract
 * Components (BigData.ComputeCluster, BigData.DataProcessingJob,
 * BigData.MlExperiment, BigData.Datalake). It NEVER names a vendor or an offer —
 * those are chosen later, per component, when a LiveSystem is built (see
 * index.ts). Add a new vendor to the catalogue tomorrow and this Fractal
 * supports it unchanged.
 *
 * Two kinds of specialization live here:
 *   - GUARDRAILS — the architect calls `.withXxx()` at design time. The value is
 *     LOCKED: a consuming dev cannot override it. These are infra/capacity
 *     PARAMETERS (max workers, auto-termination, retries, versioning, ...) —
 *     governance the platform team owns.
 *   - OPERATIONS — the typed Interface a consuming dev uses. These are
 *     APPLICATION-level verbs (what the app decides — what it calls its cluster,
 *     when its job runs, what it names its experiment), NOT pass-through setters
 *     for infra parameters. Operations carry the app's intent into neutral
 *     params; they never expose vendor/capacity knobs.
 *
 * Imported from the locked model surface: '@fractal_cloud/sdk/model'.
 */
import {
  createFractal,
  ComputeCluster,
  DataProcessingJob,
  MlExperiment,
  Datalake,
} from '@fractal_cloud/sdk/model';

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'wizard',
};

/**
 * Author the "governed big data" Fractal. Returns a reusable, immutable Fractal:
 * `.specialize()` never mutates it, so it is safe to author once and instantiate
 * many times (see index.ts).
 */
export function authorFractal() {
  return createFractal({
    id: 'basic-big-data',
    version: {major: 1, minor: 0, patch: 0},
    description:
      'Governed data platform: a Spark cluster, a scheduled ETL job, an ML ' +
      'experiment tracker, and a versioned data lake.',
    boundedContextId,
    blueprint: bp => {
      // ── Compute cluster — capacity + lifecycle are governed. The app may name
      //    the cluster (withClusterName op), but never resize it. ──
      const cluster = bp.add(
        ComputeCluster({id: 'analytics-cluster'})
          .withMaxWorkers(10) // guardrail: capacity ceiling
          .withAutoTerminationMinutes(30), // guardrail: idle shutdown
      );

      // ── ETL job — retry policy is governed; cannot run before the cluster.
      //    The app owns the schedule (withJobSchedule op). ──
      const job = bp.add(
        DataProcessingJob({id: 'etl-job'})
          .withMaxRetries(3) // guardrail: retry policy
          .dependsOn(cluster), // structural: needs the cluster
      );

      // ── ML experiment tracker. The app owns its display name
      //    (withExperimentName op); no infra guardrails to govern. ──
      const experiment = bp.add(MlExperiment({id: 'fraud-model'}));

      // ── Data lake — object versioning is governed (keep object history). ──
      const lake = bp.add(
        Datalake({id: 'lake'}).withVersioningEnabled(true), // guardrail
      );

      return {cluster, job, experiment, lake};
    },

    // ── OPERATIONS — application-level verbs only. What the APP decides: what it
    //    calls its cluster, when its job runs, and what it names its experiment.
    //    Capacity/retry/versioning are architect guardrails, not exposed here. ──
    operations: s => ({
      /** The name the application gives its compute cluster. */
      withClusterName: (v: string) => s.cluster.set('clusterName', v),
      /** The cron schedule on which the application's ETL job runs. */
      withJobSchedule: (v: string) => s.job.set('cronSchedule', v),
      /** The display name the application gives its ML experiment. */
      withExperimentName: (v: string) =>
        s.experiment.set('experimentName', v),
    }),
  });
}
