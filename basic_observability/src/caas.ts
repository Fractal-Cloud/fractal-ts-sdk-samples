/**
 * caas.ts — run the Observability Fractal on a Kubernetes/CaaS cluster (vendor-neutral).
 * COPY THIS FILE to adopt the Fractal, then run it. Fully self-contained; the
 * ONLY platform-specific code is the `select` map below.
 *
 * These observability offers are all vendor-neutral CaaS (Prometheus, Jaeger,
 * Elastic on any cluster), so there is exactly one offer per component and no
 * provider switch is needed. The architect guardrails (retention / scrape
 * interval / sampling rate) govern the stack regardless of which cluster the
 * CaaS offers land on.
 *   npm run compile && node build/src/caas.js
 */
import {authorFractal} from './fractal';
import {
  deploy,
  Prometheus,
  Jaeger,
  ObservabilityElastic,
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
      name: 'basic-observability',
      environment,
      select: {
        monitoring: Prometheus({}),
        tracing: Jaeger({}),
        logging: ObservabilityElastic({}),
      },
    });

  const bc = liveSystem.boundedContext;
  console.log(
    'LIVE_SYSTEM_ID=' +
      [bc.ownerType ?? 'Personal', bc.ownerId ?? '', bc.name ?? '', liveSystem.name].join('/')
  );
  await deploy(liveSystem, credentials, {
    mode: (process.env['DEPLOY_MODE'] as 'wait' | 'fire-and-forget') ?? 'wait',
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
