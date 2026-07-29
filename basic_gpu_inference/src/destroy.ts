/**
 * destroy.ts — tear the GPU-inference LiveSystem DOWN on GCP.
 *
 *   npm run destroy         # (== npm run compile && node build/src/destroy.js)
 *
 * Targets the exact same system gcp.ts deploys (both build it from
 * live_system.ts), so bring-up/tear-down cycles are symmetric and repeatable.
 * The GPU box is expensive — run this the moment a run finishes.
 */
import {fatal} from './fatal';
import {buildLiveSystem, cloud, logLiveSystemId} from './live_system';

async function main() {
  const liveSystem = buildLiveSystem();
  logLiveSystemId(liveSystem);
  // Tears down this instantiation only — the registered blueprint stays put, so
  // the same Fractal can be deployed again.
  await cloud.liveSystems.destroy(liveSystem);
  console.log('destroyed');
}

main().catch(fatal);
