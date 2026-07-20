/**
 * gcp.ts — run the GPU-inference Fractal on GCP.
 *
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. It is fully
 * self-contained: it specializes the shared Fractal (fractal.ts), selects one
 * GCP offer per component, builds the LiveSystem, and deploys. This pattern
 * exposes no application-level operations, so `.specialize()` carries no ops.
 *
 * The ONLY cloud-specific code is the `select` map below: the VM `machineType`
 * (an A100 box) plus the `userData` first-boot script that self-bootstraps vLLM.
 * To target another cloud, copy this file and swap the offers + size key
 * (`instanceType` on AWS/Azure, `serverType` on Hetzner); `userData` is accepted
 * on every VM offer.
 *
 *   npm run compile && node build/src/gcp.js
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {authorFractal} from './fractal';
import {
  deploy,
  GcpVpc,
  GcpSubnet,
  GcpFirewall,
  GcpVm,
} from '@fractal_cloud/sdk/model';

// First-boot script (NVIDIA stack + vLLM). Lives in its own file so it stays
// readable/lintable; passed to the VM declaratively via `userData`. Path is
// relative to the compiled entrypoint (build/src/gcp.js → repo root).
const bootstrap = readFileSync(
  join(__dirname, '..', '..', 'vllm-bootstrap.sh'),
  'utf8',
);

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
      name: 'gpu-inference',
      environment,
      // ── The ONLY cloud-specific lines: one GCP offer per component. ──
      select: {
        'inference-net': GcpVpc({}),
        'inference-subnet': GcpSubnet({}),
        'inference-sg': GcpFirewall({}),
        // a2-highgpu-1g = 1× NVIDIA A100 40 GB. On-demand (not spot/preemptible)
        // so a long run is never evicted mid-flight. Requires A100 quota in the
        // target region (e.g. us-central1). `userData` is the first-boot script
        // (NVIDIA stack + vLLM) — the box self-bootstraps, no manual step.
        'vllm-host': GcpVm({machineType: 'a2-highgpu-1g', userData: bootstrap}),
      },
    });

  const bc = liveSystem.boundedContext;
  console.log(
    'LIVE_SYSTEM_ID=' +
      [
        bc.ownerType ?? 'Personal',
        bc.ownerId ?? '',
        bc.name ?? '',
        liveSystem.name,
      ].join('/'),
  );
  await deploy(liveSystem, credentials, {
    mode: (process.env['DEPLOY_MODE'] as 'wait' | 'fire-and-forget') ?? 'wait',
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
