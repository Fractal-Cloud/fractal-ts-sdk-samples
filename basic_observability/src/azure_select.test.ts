/**
 * The `logging` component must carry every parameter the agent's published
 * contract requires, and only names that contract declares.
 *
 * The platform prunes any parameter the claiming agent's contract does not
 * declare, silently, before the agent sees it. So "the sample sets it" proves
 * nothing on its own: the name has to be one the contract keeps. This test
 * builds the LiveSystem exactly as azure.ts does, takes the parameters the SDK
 * puts on the wire for `logging`, and checks them against a copy of the
 * contract published with the Azure agent image named in the fixture.
 *
 * Run: npm test
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {authorFractal} from './fractal';
import {azureSelect, loggingConfig} from './azure_select';

interface ParamSpec {
  key: string;
  required: boolean;
}

const contract = JSON.parse(
  readFileSync(
    join(__dirname, '..', '..', 'contract', 'observability-caas-elastic.json'),
    'utf8',
  ),
) as {offer: {offerType: string; params: ParamSpec[]}};

function wireParameters(componentId: string): Record<string, unknown> {
  const liveSystem = authorFractal()
    .specialize()
    .toLiveSystem({
      name: 'basic-observability',
      environment: {ownerType: 'Personal', ownerId: 'test', name: 'test'},
      select: azureSelect(),
    });
  const component = liveSystem.components.find(c => c.id === componentId);
  assert.ok(component, `no '${componentId}' component in the LiveSystem`);
  assert.equal(component.type, contract.offer.offerType);
  return component.parameters as Record<string, unknown>;
}

void test('logging carries every parameter the Elastic contract requires', () => {
  const parameters = wireParameters('logging');
  const required = contract.offer.params
    .filter(p => p.required)
    .map(p => p.key);

  assert.ok(required.length > 0, 'fixture declares no required parameters');
  for (const key of required) {
    const value = parameters[key];
    assert.ok(
      value !== undefined && value !== null && value !== '',
      `required parameter '${key}' is not on the wire`,
    );
  }
});

void test('every parameter the sample sets for logging survives the contract prune', () => {
  const declared = new Set(contract.offer.params.map(p => p.key));
  const parameters = wireParameters('logging');

  for (const key of Object.keys(loggingConfig)) {
    assert.ok(key in parameters, `'${key}' did not reach the wire`);
    assert.ok(
      declared.has(key),
      `'${key}' is not in the published contract, so it is pruned before the agent sees it`,
    );
  }
});

void test('elasticVersion is a full x.y.z version', () => {
  assert.match(
    String(wireParameters('logging')['elasticVersion']),
    /^\d+\.\d+\.\d+$/,
  );
});
