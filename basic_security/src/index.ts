/**
 * index.ts — the DEV team consumes the governed Fractal.
 *
 * The dev never authors infrastructure: they (1) specialize the Fractal through
 * its typed Interface (the dev-open ops only — guardrails are locked), then
 * (2) build a LiveSystem by SELECTING, per component, one concrete offer from
 * the open Catalogue. Selection is the ONLY place a vendor is named.
 *
 * Offer selection is per-component, so a single LiveSystem can mix vendors and
 * delivery models freely. The compiler enforces that each selected offer
 * satisfies its component.
 */
import {authorFractal} from './fractal';
import {deploy, Ocelot, Cognito} from '@fractal_cloud/sdk/model';

const environment = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['ENVIRONMENT_NAME'] ?? 'dev',
};

// Per-component offer selection — the only place a vendor is named. Swap any
// line to change vendor; the Fractal is untouched.
//   - mesh: Ocelot (vendor-neutral self-hosted CaaS service mesh).
//   - idp:  Cognito (AWS-managed identity provider).
// Keycloak({}) — a vendor-neutral self-hosted CaaS identity provider — is also a
// valid `idp` selection: a future-proof drop-in that satisfies the same
// component with no change to the Fractal.
const select = {
  mesh: Ocelot({}),
  idp: Cognito({}),
};

async function main() {
  // 1. Specialize through the Interface (dev-open ops only). Immutable: the
  //    authored Fractal is never mutated, so it stays reusable.
  // 2. Build the LiveSystem by selecting an offer per component.
  const ls = authorFractal()
    .specialize()
    // Application-level operation: the app names its user directory.
    .withUserDirectory('acme')
    .toLiveSystem({
      name: 'basic-security',
      environment,
      select,
    });

  // 3. Deploy: submit the LiveSystem and wait until Active (wait-mode logs).
  const credentials = {
    clientId: process.env['SERVICE_ACCOUNT_ID']!,
    clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
  };
  await deploy(ls, credentials, {mode: 'wait'});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
