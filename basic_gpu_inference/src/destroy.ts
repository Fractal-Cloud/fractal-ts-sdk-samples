/**
 * destroy.ts — tear the GPU-inference LiveSystem DOWN on GCP.
 *
 *   npm run destroy         # (== npm run compile && node build/src/destroy.js)
 *
 * Targets the exact same system gcp.ts deploys (both build it from
 * live_system.ts), so bring-up/tear-down cycles are symmetric and repeatable.
 * The GPU box is expensive — run this the moment a run finishes.
 */
import {destroy} from '@fractal_cloud/sdk/model';
import {buildLiveSystem, credentials, logLiveSystemId} from './live_system';

async function main() {
  const liveSystem = buildLiveSystem();
  logLiveSystemId(liveSystem);
  await destroy(liveSystem, credentials);
  console.log('destroyed');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
