/**
 * aws.ts — run the Governed API Gateway Fractal on AWS.
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. Fully
 * self-contained; the ONLY cloud-specific code is the `select` map below.
 *   npm run compile && node build/src/aws.js
 */
import {authorFractal} from './fractal';
import {deploy, AwsCloudFront} from '@fractal_cloud/sdk/model';

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
    // Application-level operations: the app declares the routes it exposes. The
    // architect's security guardrails (httpsOnly / rateLimit / cors) are locked
    // and untouchable here.
    .withRoute({path: '/orders', methods: ['GET', 'POST'], upstream: 'orders-svc'})
    .withRoute({path: '/users', methods: ['GET'], upstream: 'users-svc'})
    .toLiveSystem({
      name: 'basic-api-management',
      environment,
      // ── The ONLY cloud-specific lines: one offer per component. ──
      select: {
        'api-gateway': AwsCloudFront({region: 'us-east-1'}),
      },
    });
  await deploy(liveSystem, credentials, {mode: 'wait'});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
