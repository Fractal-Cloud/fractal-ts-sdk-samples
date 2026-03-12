/**
 * fractal.ts
 *
 * Defines a cloud-agnostic Fractal (blueprint) for a storage workload:
 *
 *   RelationalDbms (main-dbms)
 *     └── RelationalDatabase (app-db) — DBMS dep auto-wired
 *
 *   FilesAndBlobs (app-storage)
 *
 * The blueprint declares a PostgreSQL-compatible DBMS with one database
 * and a standalone object storage bucket. No cloud-provider details
 * appear here — the blueprint can be satisfied by Azure or GCP.
 */

import {
  BoundedContext,
  FilesAndBlobs,
  Fractal,
  KebabCaseString,
  OwnerId,
  OwnerType,
  RelationalDatabase,
  RelationalDbms,
  Version,
} from '@fractal_cloud/sdk';

// ── Bounded Context ────────────────────────────────────────────────────────────

export const bcId = BoundedContext.Id.getBuilder()
  .withOwnerType(OwnerType.Personal)
  .withOwnerId(OwnerId.getBuilder().withValue(process.env['OWNER_ID']!).build())
  .withName(KebabCaseString.getBuilder().withValue('wizard').build())
  .build();

// ── Relational Database ──────────────────────────────────────────────────────

const appDb = RelationalDatabase.create({
  id: 'app-db',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Application Database',
  description: 'Primary application database with UTF-8 encoding',
  collation: 'en_US.utf8',
  charset: 'UTF8',
});

// ── Relational DBMS (database dep auto-wired into app-db) ────────────────────

export const dbms = RelationalDbms.create({
  id: 'main-dbms',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Main PostgreSQL DBMS',
  description: 'PostgreSQL 15 server hosting the application database',
  dbVersion: '15',
}).withDatabases([appDb]);

// ── Object Storage ───────────────────────────────────────────────────────────

export const appStorage = FilesAndBlobs.create({
  id: 'app-storage',
  version: {major: 1, minor: 0, patch: 0},
  displayName: 'Application Storage',
  description: 'Object storage for application uploads and static assets',
});

// ── Fractal ──────────────────────────────────────────────────────────────────

export const fractal = Fractal.getBuilder()
  .withId(
    Fractal.Id.getBuilder()
      .withBoundedContextId(bcId)
      .withName(
        KebabCaseString.getBuilder().withValue('basic-storage').build(),
      )
      .withVersion(
        Version.getBuilder().withMajor(1).withMinor(0).withPatch(0).build(),
      )
      .build(),
  )
  .withComponents([
    // DBMS + database (DBMS dep auto-wired into the database)
    dbms.dbms,
    ...dbms.databases.map(db => db.component),
    // Object storage (standalone, no dependencies)
    appStorage.component,
  ])
  .build();
