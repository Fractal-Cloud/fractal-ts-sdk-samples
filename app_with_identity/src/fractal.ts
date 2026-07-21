/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * A vendor-AGNOSTIC application Fractal. The blueprint owns the GOVERNED
 * foundation only — the "where" (a ContainerPlatform), the database engine
 * (a RelationalDbms) and an IdentityProvider. It NEVER names a vendor or an
 * offer. Workloads are NOT in the blueprint: a workload is something the dev
 * team adds. The architect only governs where it may run and what it may talk to.
 *
 * Two kinds of specialization:
 *   - GUARDRAILS — the architect calls `.withXxx()` at design time; the value is
 *     LOCKED (infra/security posture: cluster version, HA, backups, MFA, ...).
 *   - OPERATIONS — the typed Interface a consuming dev uses: application-level
 *     verbs only. `withStatefulService` adds ONE stateful service: a workload
 *     (child of the platform) + its own database (child of the DBMS) + the links
 *     that wire the workload to that database and to the identity provider.
 *
 * Links are authored HERE, inside the operation — never on the dev's surface —
 * so the runtime relationships (which database a workload may reach, which
 * identity provider it authenticates against, and with what client shape) stay a
 * governed, Fractal-level concern. Connection facts (issuer, JWKS, client id) are
 * injected into the workload at reconciliation time; they are never on the link.
 */
import {
  createFractal,
  ContainerPlatform,
  IdentityProvider,
  RelationalDbms,
  RelationalDatabase,
  RelationalDatabaseLink,
  Workload,
  IdentityProviderClientLink,
} from '@fractal_cloud/sdk/model';

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'reusable-templates',
};

export function authorFractal() {
  return createFractal({
    id: 'app-with-identity',
    version: {major: 1, minor: 0, patch: 0},
    description:
      'A governed web application platform: workloads run on a managed ' +
      'container platform, authenticate against an identity provider, and each ' +
      'owns a relational database — all wired by governed operations.',
    boundedContextId,
    blueprint: bp => {
      // ── The "where" — the managed container platform workloads run on.
      //    Cluster version and network policy are governed posture. ──
      const platform = bp.add(
        ContainerPlatform({id: 'app-platform', displayName: 'Application Platform'})
          .withKubernetesVersion('1.29') // guardrail
          .withNetworkPolicyProvider('calico'), // guardrail
      );

      // ── Database engine — capacity, HA, backups and engine version governed.
      //    Logical databases are added per service by withStatefulService. ──
      const dbms = bp.add(
        RelationalDbms({id: 'app-dbms', displayName: 'Application Database Engine'})
          .withHighAvailability('zone-redundant') // guardrail
          .withBackupRetentionDays(30) // guardrail
          .withStorageGb(100) // guardrail
          .withEngineVersion('16'), // guardrail
      );

      // ── Identity provider — account security is governed. Password policy,
      //    mandatory MFA and session duration are locked posture; the app only
      //    names its user directory (withUserDirectory operation). App clients
      //    are provisioned per link, inside withStatefulService. ──
      const idp = bp.add(
        IdentityProvider({id: 'idp', displayName: 'Identity Provider'})
          .withPasswordPolicy({minLength: 12}) // guardrail
          .withMfaConfiguration('ON') // guardrail
          .withSessionDuration(3600), // guardrail
      );

      return {platform, dbms, idp};
    },

    // ── OPERATIONS — application-level verbs only. `link` (2nd arg) is the
    //    Fractal-level link authoring the Interface exposes to operations. ──
    operations: (s, {link}) => ({
      /** The application names the user directory it owns. */
      withUserDirectory: (name: string) => s.idp.set('userDirectoryName', name),
      /**
       * Add ONE stateful service. This is the motivating case for links in
       * operations: in a single governed verb the dev gets
       *   - a Workload child under the container platform (its runtime home,
       *     auto-wired as a dependency), carrying the app image plus the
       *     architect's resource/health guardrails;
       *   - a RelationalDatabase child under the DBMS (emitted in the DBMS's
       *     vendor family); and
       *   - the links that make it stateful and authenticated: workload → its
       *     database, and workload → the identity provider (provisioning ONE
       *     `web` app client). The dev never authors links directly.
       */
      withStatefulService: (svc: {
        name: string;
        image: string;
        redirectUris: string[];
        logoutUris?: string[];
        scopes?: string[];
      }) => {
        const db = RelationalDatabase({id: `${svc.name}-db`, displayName: `${svc.name} database`})
          .withCharset('UTF8') // architect-governed default
          .withCollation('en_US.utf8'); // architect-governed default
        const workload = Workload({id: svc.name, displayName: svc.name})
          .withImage(svc.image) // the app's own choice
          .withMaxReplicas(5) // guardrail
          .withCpuRequest('250m') // guardrail
          .withMemoryRequest('512Mi') // guardrail
          .withHealthCheck({path: '/healthz', port: 8080}); // guardrail
        const idpClient = {
          clientType: 'web',
          redirectUris: svc.redirectUris,
          logoutUris: svc.logoutUris,
          scopes: svc.scopes,
        } satisfies IdentityProviderClientLink;
        const transforms = [
          s.dbms.addChild(db),
          s.platform.addChild(workload),
          // The workload uses its database. `access` scopes the DB role the
          // agent grants; connection env (DB_HOST/PORT/NAME/USERNAME and a
          // DB_PASSWORD_REF secret reference) is injected from the database's
          // output fields at reconciliation time — never carried on the link.
          link(workload, db, {access: 'read-write'} satisfies RelationalDatabaseLink),
          // The workload authenticates against the identity provider; this link
          // provisions exactly one `web` app client.
          link(workload, s.idp, idpClient),
        ];
        return st => transforms.reduce((acc, t) => t(acc), st);
      },
    }),
  });
}
