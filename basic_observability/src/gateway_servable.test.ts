/**
 * The sample's gateway must stay one aria-agent-caas-k8s can serve.
 *
 * caas-k8s is the only agent that installs an Ambassador gateway, and it fails
 * one it cannot serve with the reason (AmbassadorHandler.UnservedReason):
 * a Host, license or DNS parameter, a link from the gateway, or anything but
 * exactly one cluster it reaches. Re-adding any of those would turn the
 * sample's gateway, and every console published through it, Failed. This test
 * builds the LiveSystem exactly as azure.ts does and checks that shape.
 *
 * Run: npm test
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authorFractal} from './fractal';
import {azureSelect} from './azure_select';

// Ambassador Edge Stack features caas-k8s does not serve.
const unservedParameters = [
  'hostOwnerEmail',
  'acmeProviderAuthority',
  'tlsSecretName',
  'licenseKey',
  'dnsZoneConfig',
];

// The clusters caas-k8s reaches with its own cloud identity.
const caasK8sClusterTypes = [
  'NetworkAndCompute.PaaS.AKS',
  'NetworkAndCompute.PaaS.AzureAks',
  'NetworkAndCompute.PaaS.EKS',
  'NetworkAndCompute.PaaS.AwsEks',
  'NetworkAndCompute.PaaS.GKE',
  'NetworkAndCompute.PaaS.GcpGke',
];

function liveSystem() {
  return authorFractal()
    .specialize()
    .toLiveSystem({
      name: 'basic-observability',
      environment: {ownerType: 'Personal', ownerId: 'test', name: 'test'},
      select: azureSelect(),
    });
}

void test('the gateway asks for nothing aria-agent-caas-k8s does not serve', () => {
  const ls = liveSystem();
  const gateway = ls.components.find(c => c.id === 'platform-gateway');
  assert.ok(gateway, "no 'platform-gateway' component in the LiveSystem");
  assert.equal(gateway.type, 'APIManagement.CaaS.Ambassador');

  const parameters = (gateway.parameters ?? {}) as Record<string, unknown>;
  for (const key of unservedParameters) {
    const value = parameters[key];
    const set =
      value !== undefined &&
      value !== null &&
      !(typeof value === 'string' && value.trim() === '') &&
      !(typeof value === 'object' && Object.keys(value as object).length === 0);
    assert.ok(!set, `'${key}' is not served by aria-agent-caas-k8s`);
  }
  assert.equal(
    (gateway.links ?? []).length,
    0,
    'a link from the gateway is not served by aria-agent-caas-k8s',
  );

  const byId = new Map(ls.components.map(c => [c.id, c]));
  const clusters = [
    ...new Set(
      (gateway.dependencies ?? [])
        .map(id => byId.get(id))
        .filter(c => c?.type.startsWith('NetworkAndCompute.PaaS.'))
        .map(c => c!.id),
    ),
  ];
  assert.equal(
    clusters.length,
    1,
    'the gateway must depend on exactly one cluster',
  );
  assert.ok(
    caasK8sClusterTypes.includes(byId.get(clusters[0])!.type),
    `${byId.get(clusters[0])!.type} is not a cluster caas-k8s reaches`,
  );
});
