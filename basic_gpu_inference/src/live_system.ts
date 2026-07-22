/**
 * live_system.ts — the single source of truth for the GPU-inference LiveSystem.
 *
 * Both entrypoints import from here so bring-up and tear-down operate on the
 * IDENTICAL definition:
 *   - gcp.ts     → deploy()  (put it up)
 *   - destroy.ts → destroy() (tear it down)
 *
 * The ONLY cloud-specific code is the `select` map: the VM `machineType`
 * (an A100 box), its `region`, and the `userData` first-boot script that
 * self-bootstraps vLLM. To target another cloud, swap the offers + size key
 * (`instanceType` on AWS/Azure, `serverType` on Hetzner); `region`/`userData`
 * are accepted on every VM offer.
 */
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {authorFractal} from './fractal';
import {GcpVpc, GcpSubnet, GcpFirewall, GcpVm} from '@fractal_cloud/sdk/model';

// First-boot script (NVIDIA stack + vLLM). Lives in its own file so it stays
// readable/lintable; passed to the VM declaratively via `userData`. Path is
// relative to the compiled entrypoint (build/src/*.js → repo root).
const bootstrap = readFileSync(
  join(__dirname, '..', '..', 'vllm-bootstrap.sh'),
  'utf8',
);

// Region for every regional GCP offer (selected per-component, overrides the
// environment default). us-central1 has on-demand A100 quota for the a2 GPU box;
// override with REGION. The VM and its subnet must share the same region.
const REGION = process.env['REGION'] ?? 'us-central1';

const environment = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['ENVIRONMENT_NAME'] ?? 'dev',
};

/** Fractal Cloud service-account credentials, from the environment. */
export const credentials = {
  clientId: process.env['SERVICE_ACCOUNT_ID']!,
  clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
};

/**
 * Build the LiveSystem. Pure + deterministic (same env → same definition), so
 * deploy and destroy always target exactly the same system.
 */
export function buildLiveSystem() {
  return authorFractal()
    .specialize()
    .toLiveSystem({
      name: 'gpu-inference',
      environment,
      // ── The ONLY cloud-specific lines: one GCP offer per component. ──
      select: {
        'inference-net': GcpVpc({region: REGION}),
        'inference-subnet': GcpSubnet({region: REGION}),
        'inference-sg': GcpFirewall({region: REGION}),
        // a2-highgpu-1g = 1× NVIDIA A100 40 GB. On-demand (not spot/preemptible)
        // so a long run is never evicted mid-flight. Requires A100 quota in
        // `region`. `userData` is the first-boot script (NVIDIA stack + vLLM) —
        // the box self-bootstraps, no manual step.
        'vllm-host': GcpVm({
          region: REGION,
          machineType: 'a2-highgpu-1g',
          userData: bootstrap,
        }),
      },
    });
}

/** Print the canonical LIVE_SYSTEM_ID line (stable across deploy/destroy). */
export function logLiveSystemId(ls: ReturnType<typeof buildLiveSystem>): void {
  const bc = ls.boundedContext;
  console.log(
    'LIVE_SYSTEM_ID=' +
      [
        bc.ownerType ?? 'Personal',
        bc.ownerId ?? '',
        bc.name ?? '',
        ls.name,
      ].join('/'),
  );
}
