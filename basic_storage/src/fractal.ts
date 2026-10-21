/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * This is a vendor-AGNOSTIC Fractal: the blueprint references only abstract
 * Components (Storage.ObjectStorage, Storage.RelationalDbms,
 * Storage.RelationalDatabase). It NEVER names a vendor or an offer — those are
 * chosen later, per component, when a LiveSystem is built (see <cloud>.ts). Add a
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
 * The guardrails that depend on the target's offers. Building a LiveSystem
 * refuses a guardrail its selected offer cannot enforce, so the architect locks
 * only what the target honors. A posture is its own Fractal (its own id): one
 * blueprint id must not stand for two different sets of guardrails.
 */
export type Posture = {
  /** The Fractal id of this posture. */
  id: string;
  /**
   * Lock object versioning on the bucket. S3 and GCS honor it; the
   * Azure Blob agent sets no blob versioning.
   */
  lockVersioning: boolean;
  /**
   * Lock the bucket's retention. S3 honors it (a lifecycle expiration);
   * the Azure Blob and GCS agents set no retention.
   */
  lockRetention: boolean;
  /**
   * Lock the bucket's storage class. GCS honors it; S3 sets none and
   * Azure Blob takes its tier from the offer's `accessTier`.
   */
  lockStorageClass: boolean;
  /**
   * Lock the DBMS backup retention, storage and engine version. Azure
   * PostgreSQL honors them; the Cloud SQL for PostgreSQL agent declares
   * none of them.
   */
  lockDbmsSizing: boolean;
};

/**
 * Author the "governed storage" Fractal. Returns a reusable, immutable Fractal:
 * `.specialize()` never mutates it, so it is safe to author once and instantiate
 * many times (see <cloud>.ts).
 */
export function authorFractal(posture: Posture) {
  return createFractal({
    id: posture.id,
    version: {major: 1, minor: 1, patch: 0},
    description: 'Governed storage: an uploads bucket + a relational database.',
    boundedContextId,
    blueprint: bp => {
      // ── Uploads bucket — security posture is governed everywhere; history,
      //    retention and storage class wherever the bucket offer enforces them
      //    (see Posture). ──
      let bucket =
        // The id becomes the bucket/account name verbatim on every cloud, and all three
        // namespaces are global. Plain 'uploads' is already owned by another party on S3
        // (HeadBucket answers 403, not 404), so this sample could never create it there.
        // Must stay lowercase alphanumeric and <=24 chars: Azure storage accounts allow
        // neither hyphens nor more than 24. Do not shorten this back.
        ObjectStorage({id: 'acmestorageuploads', displayName: 'Uploads Bucket'})
          .withEncryption('at-rest') // guardrail: always encrypted
          .withPublicAccess(false); // guardrail: never public
      if (posture.lockVersioning) {
        bucket = bucket.withVersioningEnabled(true); // guardrail: keep object history
      }
      if (posture.lockRetention) {
        bucket = bucket.withRetentionDays(90); // guardrail: minimum retention
      }
      if (posture.lockStorageClass) {
        bucket = bucket.withStorageClass('standard'); // guardrail: infra param, not app's choice
      }
      const uploads = bp.add(bucket);

      // ── Database engine — capacity, backups and engine version governed
      //    wherever the DBMS offer enforces them (see Posture). Availability is
      //    no guardrail: Azure PostgreSQL sets it with highAvailabilityMode and
      //    the Cloud SQL agent declares none. The logical databases themselves
      //    are declared by the application via
      //    the withDatabases operation (each becomes a RelationalDatabase
      //    component emitted by the selected DBMS offer). ──
      // The component id is NOT cosmetic on Azure: the agent names the
      // PostgreSQL flexible server after it, and that name is a GLOBAL DNS
      // label ({name}.postgres.database.azure.com). The obvious id 'app-dbms'
      // is already declared by the app_with_identity sample, so both samples
      // requested the same global name in every sweep and whichever ran second
      // could never get it. Keep this id distinct from every other sample's.
      const engine = RelationalDbms({
        id: 'storage-dbms',
        displayName: 'Application Database Engine',
      });
      const dbms = bp.add(
        posture.lockDbmsSizing
          ? engine
              .withBackupRetentionDays(30) // guardrail
              .withStorageGb(100) // guardrail
              .withEngineVersion('16') // guardrail: infra param, not app's choice
          : engine,
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
