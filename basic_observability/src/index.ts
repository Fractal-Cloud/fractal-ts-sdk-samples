/**
 * index.ts — the DEV team consumes the governed Fractal.
 *
 * The dev never authors infrastructure: they (1) specialize the Fractal (here
 * there are no dev-open operations — the stack is fully governed by architect
 * guardrails), then (2) build a LiveSystem by SELECTING, per component, one
 * concrete offer from the open Catalogue. Selection is the ONLY place an
 * implementation is named.
 *
 * These observability offers are all vendor-neutral CaaS (Prometheus, Jaeger,
 * Elastic on any cluster), so `provider` is undefined and there is exactly ONE
 * offer per component — no provider switch is needed. The architect guardrails
 * (retention / scrape interval / sampling rate) govern the stack regardless of
 * which cluster the CaaS offers land on.
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

async function main() {
  // 1. Specialize (no dev-open ops — guardrails fully govern the stack).
  // 2. Build the LiveSystem by selecting one CaaS offer per component. These
  //    are vendor-neutral self-hosted offers, so there is no provider switch.
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

  // 3. Deploy: submit the LiveSystem and wait until Active (wait-mode logs).
  const credentials = {
    clientId: process.env['SERVICE_ACCOUNT_ID']!,
    clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
  };
  await deploy(liveSystem, credentials, {mode: 'wait'});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
