/**
 * index.ts
 *
 * CI/CD entry point — deploys the Fractal blueprint and the AWS Live System,
 * then BLOCKS until both reach Active status before exiting.
 *
 * This is the correct pattern for CI/CD pipelines: the process exits with
 * code 0 only when infrastructure is fully provisioned and Active.
 * A non-zero exit code fails the pipeline and surfaces the error.
 *
 * Deployment timeout and polling interval are configurable via environment
 * variables so that pipeline operators can tune them without code changes.
 *
 * Required environment variables:
 *   SERVICE_ACCOUNT_ID      – Fractal Cloud service account ID
 *   SERVICE_ACCOUNT_SECRET  – Fractal Cloud service account secret
 *   OWNER_ID                – UUID of the Fractal Cloud owner
 *
 * Optional environment variables:
 *   ENVIRONMENT_NAME        – kebab-case environment name (default: "dev")
 *   DEPLOY_TIMEOUT_MS       – max ms to wait for Active status (default: 600000 = 10 min)
 *   DEPLOY_POLL_INTERVAL_MS – polling interval in ms (default: 5000 = 5 s)
 *   AWS_AVAILABILITY_ZONE   – EC2 subnet AZ (default: "eu-central-1a")
 *   EC2_AMI_ID              – EC2 AMI ID (default: "ami-0970102fe1454052a")
 *   EC2_INSTANCE_TYPE       – EC2 instance type (default: "t3.micro" / "t3.small")
 *   EC2_KEY_NAME            – (optional) EC2 key pair name for SSH; omit to launch without a key pair
 */

import {ServiceAccountCredentials, ServiceAccountId} from '@fractal_cloud/sdk';
import {fractal} from './fractal';
import {getLiveSystem} from './aws_live_system';

const credentials = ServiceAccountCredentials.getBuilder()
  .withId(
    ServiceAccountId.getBuilder()
      .withValue(process.env['SERVICE_ACCOUNT_ID']!)
      .build(),
  )
  .withSecret(process.env['SERVICE_ACCOUNT_SECRET']!)
  .build();

const timeoutMs = process.env['DEPLOY_TIMEOUT_MS']
  ? parseInt(process.env['DEPLOY_TIMEOUT_MS'], 10)
  : 600_000;

const pollIntervalMs = process.env['DEPLOY_POLL_INTERVAL_MS']
  ? parseInt(process.env['DEPLOY_POLL_INTERVAL_MS'], 10)
  : 5_000;

const deployOptions = {
  mode: 'wait' as const,
  timeoutMs,
  pollIntervalMs,
};

async function main() {
  console.log('Registering Fractal blueprint...');
  await fractal.deploy(credentials);
  console.log('Fractal blueprint registered.');

  console.log('Deploying Live System...');
  const liveSystem = getLiveSystem();
  await liveSystem.deploy(credentials, deployOptions);
  console.log('Live System is Active. Infrastructure provisioned successfully.');
}

main().catch(err => {
  console.error('Deployment failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
