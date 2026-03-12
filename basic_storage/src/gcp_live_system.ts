/**
 * gcp_live_system.ts
 *
 * Satisfies the basic storage Fractal with GCP-specific components:
 *   - GcpCloudStorage           satisfies FilesAndBlobs
 *   - GcpPostgreSqlDbms         satisfies RelationalDbms  (dbVersion carried from blueprint)
 *   - GcpPostgreSqlDatabase     satisfies RelationalDatabase (collation + charset carried)
 *
 * Structural properties — dependencies, dbVersion, collation, charset —
 * are all locked in the blueprint and carried over automatically by
 * satisfy(). Only GCP-specific parameters are set here.
 *
 * Environment variables:
 *   GCP_REGION  – (optional) GCP region, default "europe-west1"
 */

import {
  GcpCloudStorage,
  GcpPostgreSqlDatabase,
  GcpPostgreSqlDbms,
  Environment,
  KebabCaseString,
  LiveSystem,
  OwnerId,
  OwnerType,
} from '@fractal_cloud/sdk';
import {bcId, fractal, dbms, appStorage} from './fractal';

// Retrieve blueprint components by ID
function bp(id: string) {
  const c = fractal.components.find(x => x.id.toString() === id);
  if (!c) throw new Error(`Blueprint component '${id}' not found`);
  return c;
}

export function getLiveSystem(): LiveSystem {
  const region = process.env['GCP_REGION'] ?? 'europe-west1';

  // ── Cloud Storage — satisfies FilesAndBlobs ────────────────────────────────

  const gcpStorage = GcpCloudStorage.satisfy(appStorage.component)
    .withRegion(region)
    .withStorageClass('STANDARD')
    .withVersioningEnabled(true)
    .build();

  // ── Cloud SQL PostgreSQL DBMS — satisfies RelationalDbms ───────────────────
  // dbVersion ('15') is carried from the blueprint automatically.

  const gcpDbms = GcpPostgreSqlDbms.satisfy(dbms.dbms)
    .withRegion(region)
    .withTier('db-f1-micro')
    .build();

  // ── Cloud SQL PostgreSQL Database — satisfies RelationalDatabase ───────────
  // collation ('en_US.utf8') and charset ('UTF8') are carried from the
  // blueprint automatically. The DBMS dependency is auto-wired.

  const gcpDb = GcpPostgreSqlDatabase.satisfy(bp('app-db')).build();

  // ── Live System ─────────────────────────────────────────────────────────────

  return LiveSystem.getBuilder()
    .withId(
      LiveSystem.Id.getBuilder()
        .withBoundedContextId(bcId)
        .withName(
          KebabCaseString.getBuilder()
            .withValue('basic-storage-gcp')
            .build(),
        )
        .build(),
    )
    .withFractalId(fractal.id)
    .withDescription(
      'Storage workload on GCP — Cloud SQL PostgreSQL + Cloud Storage',
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
    .withComponent(gcpStorage)
    .withComponent(gcpDbms)
    .withComponent(gcpDb)
    .build();
}
