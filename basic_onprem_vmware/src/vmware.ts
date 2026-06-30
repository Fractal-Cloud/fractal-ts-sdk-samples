/**
 * vmware.ts — run the governed Fractal on VMware vSphere.
 * COPY THIS FILE to adopt the Fractal on your platform, then run it. Fully
 * self-contained; the ONLY platform-specific code is the `select` map below.
 *   npm run compile && node build/src/vmware.js
 */
import {authorFractal} from './fractal';
import {
  deploy,
  VspherePortGroup,
  VsphereVlan,
  VsphereVm,
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
      name: 'basic-onprem-vmware',
      environment,
      // Per-component offer selection. Each entry maps a blueprint component id
      // (from fractal.ts) to a concrete VMware offer plus that offer's vendor
      // config — the dvSwitch the port group binds to, the VLAN id, the VM
      // template. These vSphere knobs are offer config, never blueprint params.
      select: {
        'main-network': VspherePortGroup({dvSwitchName: 'dvs0'}),
        'server-vlan': VsphereVlan({vlanId: 100}),
        'api-server': VsphereVm({template: 'ubuntu-24.04'}),
        'web-server': VsphereVm({template: 'ubuntu-24.04'}),
      },
    });

  await deploy(liveSystem, credentials, {mode: 'wait'});
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
