/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * A vendor-AGNOSTIC Fractal declaring one abstract Component,
 * Storage.RelationalDbms. It never names a vendor or an offer — those are chosen
 * per component when a LiveSystem is built (see gcp.ts).
 *
 * Deliberately NO databases. Every other DBMS sample declares its logical
 * databases through a `withDatabases` operation, and the selected DBMS offer
 * emits one RelationalDatabase live component per name. The GCP MySQL offer
 * cannot: `Storage.PaaS.GcpMySqlDatabase` does not exist, so the offer omits
 * `instantiate` and `toLiveSystem` refuses a DBMS that has children rather than
 * emitting a type no agent handles. A `withDatabases` here would therefore be an
 * operation that throws whenever anyone called it. When the Database tier lands,
 * add the operation and the child components in that change.
 *
 * Imported from the locked model surface: '@fractal_cloud/sdk/model'.
 */
import {createFractal, RelationalDbms} from '@fractal_cloud/sdk/model';

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'reusable-templates',
};

/**
 * Author the "governed MySQL" Fractal. Returns a reusable, immutable Fractal:
 * `.specialize()` never mutates it, so it is safe to author once and instantiate
 * many times.
 */
export function authorFractal() {
  return createFractal({
    id: 'basic-mysql',
    version: {major: 1, minor: 0, patch: 0},
    description: 'Governed MySQL: one relational database engine.',
    boundedContextId,
    blueprint: bp => {
      // The component id is NOT cosmetic: the GCP agent names the Cloud SQL
      // instance after it, and an instance name is unique per project — so two
      // samples sharing an id request the same instance in every sweep and
      // whichever runs second cannot get it. `storage-dbms` belongs to
      // basic_storage and `app-dbms` to app_with_identity; keep this distinct
      // from both, and from every other sample's.
      const dbms = bp.add(
        RelationalDbms({
          id: 'mysql-dbms',
          displayName: 'Application MySQL Engine',
        })
          .withHighAvailability('zone-redundant') // guardrail
          .withBackupRetentionDays(30) // guardrail
          .withStorageGb(100) // guardrail
          .withEngineVersion('8.4'), // guardrail: infra param, not app's choice
      );

      return {dbms};
    },
  });
}
