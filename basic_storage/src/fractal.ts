/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * This is a vendor-AGNOSTIC Fractal: the blueprint references only abstract
 * Components (Storage.ObjectStorage, Storage.RelationalDbms,
 * Storage.RelationalDatabase). It NEVER names a vendor or an offer — those are
 * chosen later, per component, when a LiveSystem is built (see index.ts). Add a
 * new vendor to the catalogue tomorrow and this Fractal supports it unchanged.
 *
 * Two kinds of specialization live here:
 *   - GUARDRAILS — the architect calls `.withXxx()` at design time. The value is
 *     LOCKED: a consuming dev cannot override it. These are infra/engine
 *     PARAMETERS (encryption, versioning, backups, HA, engine version, storage
 *     class, charset, collation, ...).
 *   - OPERATIONS — the typed Interface a consuming dev uses. These are
 *     APPLICATION-level verbs (what the app decides — its folders, its schemas),
 *     NOT pass-through setters for infra/engine parameters. Operations carry the
 *     app's intent into neutral params; they never expose vendor/engine knobs.
 *
 * Imported from the locked model surface: '@fractal_cloud/sdk/model'.
 */
import {
  createFractal,
  ObjectStorage,
  RelationalDbms,
  RelationalDatabase,
} from '@fractal_cloud/sdk/model';

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'reusable-templates',
};

/**
 * Author the "governed storage" Fractal. Returns a reusable, immutable Fractal:
 * `.specialize()` never mutates it, so it is safe to author once and instantiate
 * many times (see index.ts).
 */
export function authorFractal() {
  return createFractal({
    id: 'basic-storage',
    version: {major: 1, minor: 0, patch: 0},
    description: 'Governed storage: an uploads bucket + a relational database.',
    boundedContextId,
    blueprint: bp => {
      // ── Uploads bucket — security posture + storage class are governed. ──
      const uploads = bp.add(
        ObjectStorage({id: 'uploads', displayName: 'Uploads Bucket'})
          .withEncryption('at-rest') // guardrail: always encrypted
          .withPublicAccess(false) // guardrail: never public
          .withVersioningEnabled(true) // guardrail: keep object history
          .withRetentionDays(90) // guardrail: minimum retention
          .withStorageClass('standard'), // guardrail: infra param, not app's choice
      );

      // ── Database engine — capacity, HA, backups and engine version governed.
      //    The logical databases themselves are declared by the application via
      //    the withDatabases operation (each becomes a RelationalDatabase
      //    component emitted by the selected DBMS offer). ──
      const dbms = bp.add(
        RelationalDbms({
          id: 'app-dbms',
          displayName: 'Application Database Engine',
        })
          .withHighAvailability('zone-redundant') // guardrail
          .withBackupRetentionDays(30) // guardrail
          .withStorageGb(100) // guardrail
          .withEngineVersion('16'), // guardrail: infra param, not app's choice
      );

      return {uploads, dbms};
    },

    // ── OPERATIONS — application-level verbs only. What the APP decides: the
    //    folders it writes to, and the databases it owns (by name). Infra/engine
    //    parameters (charset/collation/version/...) are architect guardrails. ──
    operations: s => ({
      /** The application's bucket folder layout. */
      withFolders: (folders: string[]) => s.uploads.set('folders', folders),
      /**
       * The databases the application owns, by name. Each is added as a
       * first-class RelationalDatabase component under the DBMS and emitted by
       * the selected DBMS offer in its own vendor family (no separate offer to
       * pick). charset/collation are architect-governed defaults.
       */
      withDatabases: (names: string[]) => {
        const adds = names.map(name =>
          s.dbms.addChild(
            RelationalDatabase({id: name, displayName: name})
              .withCharset('UTF8')
              .withCollation('en_US.utf8'),
          ),
        );
        return st => adds.reduce((acc, add) => add(acc), st);
      },
    }),
  });
}
