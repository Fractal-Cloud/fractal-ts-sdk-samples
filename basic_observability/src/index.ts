/**
 * index.ts
 *
 * Entry point for the basic observability sample.
 *
 * This sample is CaaS-only (Prometheus, Jaeger, Elastic),
 * so there is no multi-provider dispatch.
 *
 * Environment variables:
 *   SERVICE_ACCOUNT_ID     – Fractal Cloud service account ID
 *   SERVICE_ACCOUNT_SECRET – Fractal Cloud service account secret
 *   OWNER_ID               – UUID of the Fractal Cloud owner
 *   ENVIRONMENT_NAME       – kebab-case environment name, e.g. "dev"
 */

import {ServiceAccountCredentials, ServiceAccountId} from '@fractal_cloud/sdk';
import {fractal} from './fractal';
import {getLiveSystem} from './caas_live_system';

const credentials = ServiceAccountCredentials.getBuilder()
  .withId(
    ServiceAccountId.getBuilder()
      .withValue(process.env['SERVICE_ACCOUNT_ID']!)
      .build(),
  )
  .withSecret(process.env['SERVICE_ACCOUNT_SECRET']!)
  .build();

const liveSystem = getLiveSystem();

async function main() {
  await fractal.deploy(credentials);
  await liveSystem.deploy(credentials);
}

main().catch(console.error);
