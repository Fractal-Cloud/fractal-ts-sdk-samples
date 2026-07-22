/**
 * gcp.ts — bring the GPU-inference LiveSystem UP on GCP.
 *
 *   npm run deploy          # (== npm run compile && node build/src/gcp.js)
 *
 * The LiveSystem definition (offers, region, GPU size, vLLM bootstrap) lives in
 * live_system.ts so deploy and destroy share one source of truth. Tear it down
 * with `npm run destroy` (destroy.ts).
 *
 * Deploys in `wait` mode by default — blocks until Active (or fails). Set
 * DEPLOY_MODE=fire-and-forget to submit and return immediately.
 */
import {deploy, getLiveSystemOutputs} from '@fractal_cloud/sdk/model';
import {buildLiveSystem, credentials, logLiveSystemId} from './live_system';

// The blueprint component that hosts vLLM (see live_system.ts `select`).
const VLLM_HOST = 'vllm-host';

async function main() {
  const liveSystem = buildLiveSystem();
  logLiveSystemId(liveSystem);
  const mode =
    (process.env['DEPLOY_MODE'] as 'wait' | 'fire-and-forget') ?? 'wait';

  // In `wait` mode deploy() resolves to the LiveSystem state; in fire-and-forget
  // it returns undefined, so read the outputs back once the system is up.
  const state =
    (await deploy(liveSystem, credentials, {mode})) ??
    (mode === 'fire-and-forget'
      ? await getLiveSystemOutputs(liveSystem, credentials)
      : undefined);

  // Read the host's private IP straight from the SDK — no gcloud side-channel.
  // vLLM listens on :8000, VPC-internal, so this is the address to drive it.
  const privateIp = state?.components[VLLM_HOST]?.outputFields.privateIp;
  if (privateIp) {
    console.log(`VLLM_PRIVATE_IP=${privateIp}`);
    console.log(`VLLM_BASE_URL=http://${privateIp}:8000`);
  } else {
    console.warn(
      `[${VLLM_HOST}] has no privateIp yet — the VM may still be provisioning; ` +
        're-run getLiveSystemOutputs() shortly.',
    );
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
