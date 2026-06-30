/**
 * index.ts — the DEV team consumes the governed Fractal.
 *
 * The dev never authors infrastructure: they (1) specialize the Fractal through
 * its typed Interface, then (2) build a LiveSystem by SELECTING, per component,
 * one concrete offer from the open Catalogue. Selection is the ONLY place a
 * vendor is named — this Fractal exposes no operations, so specialization is a
 * bare `.specialize()` and all the variability lives in the selection below.
 *
 * Offer selection is per-component, so a single LiveSystem could mix vendors and
 * delivery models freely. Here we keep each provider coherent (all Azure, or all
 * GCP) and switch the whole set with CLOUD_PROVIDER — swap the offers and the
 * Fractal is untouched.
 */
import {authorFractal} from './fractal';
import {
  deploy,
  AzureServiceBus,
  AzureServiceBusTopic,
  GcpPubSub,
  GcpPubSubTopic,
} from '@fractal_cloud/sdk/model';

const environment = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['ENVIRONMENT_NAME'] ?? 'dev',
};

// Per-component offer selection. Each branch satisfies every blueprint component
// with one vendor family; the compiler enforces that each offer satisfies its
// component. Add a vendor = add a branch (and offers to the catalogue) — the
// Fractal never changes.
function selectionFor(provider: 'azure' | 'gcp') {
  switch (provider) {
    case 'gcp':
      return {
        'event-broker': GcpPubSub({}),
        'orders-topic': GcpPubSubTopic({}),
        'notifications-topic': GcpPubSubTopic({}),
      };
    case 'azure':
    default:
      return {
        'event-broker': AzureServiceBus({resourceGroup: 'rg-msg'}),
        'orders-topic': AzureServiceBusTopic({}),
        'notifications-topic': AzureServiceBusTopic({}),
      };
  }
}

async function main() {
  const provider = (process.env['CLOUD_PROVIDER'] ?? 'azure') as 'azure' | 'gcp';

  // 1. Specialize through the Interface (none exposed here) — immutable, so the
  //    authored Fractal stays reusable. 2. Build the LiveSystem by selecting an
  //    offer per component.
  const ls = authorFractal()
    .specialize()
    .toLiveSystem({
      name: 'basic-messaging',
      environment,
      select: selectionFor(provider),
    });

  // 3. Deploy: submit the LiveSystem and wait until Active (wait-mode logs).
  await deploy(
    ls,
    {
      clientId: process.env['SERVICE_ACCOUNT_ID']!,
      clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
    },
    {mode: 'wait'},
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
