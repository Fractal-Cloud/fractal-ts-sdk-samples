/**
 * index.ts
 *
 * Entry point for the basic container platform sample.
 *
 * Required environment variables:
 *   SERVICE_ACCOUNT_ID      – Fractal Cloud service account ID
 *   SERVICE_ACCOUNT_SECRET  – Fractal Cloud service account secret
 *   OWNER_ID                – UUID of the Fractal Cloud owner
 *   ENVIRONMENT_NAME        – kebab-case name of the target environment (e.g. "dev")
 *   ECS_EXECUTION_ROLE_ARN  – (optional) IAM execution role ARN for ECS tasks
 *   ECS_TASK_ROLE_ARN       – (optional) IAM task role ARN for the API workload
 */

import {ServiceAccountCredentials, ServiceAccountId} from '@fractal_cloud/sdk';
import {fractal} from './fractal';
import {liveSystem} from './aws_live_system';

const credentials = ServiceAccountCredentials.getBuilder()
  .withId(
    ServiceAccountId.getBuilder()
      .withValue(process.env['SERVICE_ACCOUNT_ID']!)
      .build(),
  )
  .withSecret(process.env['SERVICE_ACCOUNT_SECRET']!)
  .build();

fractal.deploy(credentials).catch(console.error);
liveSystem.deploy(credentials).catch(console.error);
