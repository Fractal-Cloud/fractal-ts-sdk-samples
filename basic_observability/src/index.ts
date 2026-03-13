/**
 * index.ts
 *
 * Entry point for the basic observability sample.
 * CaaS-only — no multi-provider dispatch needed.
 */

import {fractal} from './fractal';
import {getLiveSystem} from './caas_live_system';

const liveSystem = getLiveSystem();

console.log('Fractal:', fractal.id.toString());
console.log('Live System components:', liveSystem.components.length);
