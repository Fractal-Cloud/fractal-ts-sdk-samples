/**
 * index.ts — the DEV team consumes the governed Fractal.
 *
 * The dev never authors infrastructure. They (1) specialize the Fractal (here
 * there are no application-level operations, so `.specialize()` carries no extra
 * ops — guardrails are already locked in the blueprint), then (2) build a
 * LiveSystem by SELECTING, per component, one concrete offer from the open
 * Catalogue. Selection is the ONLY place a vendor is named, and the ONLY place
 * vendor knobs (the vSphere template, dvSwitch, vlanId) are supplied.
 *
 * This sample targets a SINGLE on-prem vendor — VMware vSphere — so every slot is
 * filled by a Vsphere* offer. The Fractal itself is vendor-agnostic; retargeting
 * a component to a different vendor is a one-line change in the `select` map
 * below, and fractal.ts is never touched.
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

// Per-component offer selection. Each entry maps a blueprint component id (from
// fractal.ts) to a concrete VMware offer plus that offer's vendor config — the
// dvSwitch the port group binds to, the VLAN id, the VM template. These vSphere
// knobs are offer config, never blueprint parameters.
const select = {
  'main-network': VspherePortGroup({dvSwitchName: 'dvs0'}),
  'server-vlan': VsphereVlan({vlanId: 100}),
  'api-server': VsphereVm({template: 'ubuntu-24.04'}),
  'web-server': VsphereVm({template: 'ubuntu-24.04'}),
};

async function main() {
  // 1. Specialize (no app-level ops here). Immutable: the authored Fractal is
  //    never mutated, so it stays reusable.
  // 2. Build the LiveSystem by selecting an offer per component.
  const ls = authorFractal().specialize().toLiveSystem({
    name: 'basic-onprem-vmware',
    environment,
    select,
  });

  // 3. Deploy: submit the LiveSystem and wait until Active (wait-mode logs).
  await deploy(
    ls,
    {
      clientId: process.env['SERVICE_ACCOUNT_ID']!,
      clientSecret: process.env['SERVICE_ACCOUNT_SECRET']!,
    },
    {mode: 'wait'},
  );
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
