/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * A vendor-AGNOSTIC application Fractal: a Workload (the app) that authenticates
 * against an IdentityProvider and persists to a relational database. The
 * blueprint references only abstract Components — it NEVER names a vendor or an
 * offer. The same Fractal runs on AWS (Cognito) or Azure (Entra External ID);
 * the only thing that changes is the per-component `select` map (see azure.ts /
 * mixed.ts).
 *
 * Two kinds of specialization:
 *   - GUARDRAILS — the architect calls `.withXxx()` at design time; the value is
 *     LOCKED (infra/security posture: MFA, password policy, HA, backups, health).
 *   - OPERATIONS — the typed Interface a consuming dev uses: application-level
 *     verbs only (the web image, the user-directory name, the databases owned).
 *
 * Structure lives here too: the app `dependsOn` the database, and a link from
 * the app to the identity provider provisions ONE app client (clientType `web`)
 * — see IdentityProviderClientLink. Connection facts (issuer, JWKS, client id)
 * are injected into the workload at reconciliation time; they are never on the
 * link.
 */
import {
  createFractal,
  Workload,
  IdentityProvider,
  RelationalDbms,
  RelationalDatabase,
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
      'A governed web application: a workload authenticated by an identity ' +
      'provider, backed by a relational database.',
    boundedContextId,
    blueprint: bp => {
      // ── Database engine — capacity, HA, backups and engine version governed.
      //    Logical databases are declared by the app via withDatabases. ──
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
      //    are provisioned per link, not here. ──
      const idp = bp.add(
        IdentityProvider({id: 'idp', displayName: 'Identity Provider'})
          .withPasswordPolicy({minLength: 12}) // guardrail
          .withMfaConfiguration('ON') // guardrail
          .withSessionDuration(3600), // guardrail
      );

      // ── The application workload — resource posture + health are governed;
      //    the container image is the app's own choice (withWebImage). ──
      const app = bp.add(
        Workload({id: 'app', displayName: 'Web Application'})
          .withMaxReplicas(5) // guardrail
          .withCpuRequest('250m') // guardrail
          .withMemoryRequest('512Mi') // guardrail
          .withHealthCheck({path: '/healthz', port: 8080}) // guardrail
          .dependsOn(dbms), // cannot start before the database exists
      );

      // ── The app declares ONE app client on the identity provider. `web` =
      //    confidential client (login flow + secret). Vendor-neutral: the same
      //    link works whether the IdP resolves to Cognito or Entra External ID. ──
      bp.link(app, idp, {
        clientType: 'web',
        redirectUris: ['https://app.acme.example/oauth2/callback'],
        logoutUris: ['https://app.acme.example/logout'],
        scopes: ['openid', 'profile', 'email'],
      } satisfies IdentityProviderClientLink);

      return {dbms, idp, app};
    },

    // ── OPERATIONS — application-level verbs only. ──
    operations: s => ({
      /** The container image the app runs (a dev choice, not a locked guardrail). */
      withWebImage: (image: string) => s.app.set('image', image),
      /** The application names the user directory it owns. */
      withUserDirectory: (name: string) => s.idp.set('userDirectoryName', name),
      /**
       * The databases the application owns, by name. Each becomes a
       * RelationalDatabase under the DBMS, emitted by the selected DBMS offer in
       * its own vendor family. charset/collation are architect-governed defaults.
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
