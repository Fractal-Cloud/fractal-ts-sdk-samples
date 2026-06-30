/**
 * azure.ts — run the Governed Messaging Fractal on Azure.
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. Fully
 * self-contained; the ONLY cloud-specific code is the `select` map below.
 *   npm run compile && node build/src/azure.js
 */
import {authorFractal} from './fractal';
import {
  deploy,
  AzureServiceBus,
  AzureServiceBusTopic,
} from '@fractal_cloud/sdk/model';

const environment = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['ENVIRONMENT_NAME'] ?? 'dev',
};

const credentials = {
  clientId: process.env['SERVICE_ACCOUNT_ID']!,
  clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
};

async function main() {
  const liveSystem = authorFractal()
    .specialize()
    .toLiveSystem({
      name: 'basic-messaging',
      environment,
      select: {
        'event-broker': AzureServiceBus({resourceGroup: 'rg-msg'}),
        'orders-topic': AzureServiceBusTopic({}),
        'notifications-topic': AzureServiceBusTopic({}),
      },
    });

  await deploy(liveSystem, credentials, {mode: 'wait'});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
