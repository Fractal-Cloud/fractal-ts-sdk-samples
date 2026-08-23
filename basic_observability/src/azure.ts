/**
 * azure.ts — run the governed observability Fractal on Azure.
 *
 * COPY THIS FILE to adopt the Fractal on your cloud, then run it. Fully
 * self-contained; the ONLY cloud-specific code is the `select` map below.
 *
 *   npm run compile && node build/src/azure.js
 *
 * Why the observability offers still say CaaS while the cluster says Azure:
 * Prometheus, Jaeger and Elastic are vendor-neutral — they are Kubernetes
 * workloads and run the same way on any cluster. What is cloud-specific is the
 * cluster they land on and the network it sits in, so those are the components
 * that take Azure offers here.
 *
 * Why the gateway is Ambassador and not AzureApiManagement: the agent's
 * observability code integrates with an IN-CLUSTER gateway. Prometheus publishes
 * Grafana, Prometheus and Alertmanager by creating Ambassador Mappings, and
 * Elastic publishes Kibana the same way — both paths are guarded by
 * `type.endsWith("Ambassador")`. A managed gateway is not recognized as the
 * LiveSystem's gateway at all (the agent looks only for the in-cluster CaaS
 * gateways), so choosing one would leave every console unrouted.
 */
import {fatal} from './fatal';
import {authorFractal} from './fractal';
import {
  createFractalCloudClient,
  AzureVnet,
  AzureSubnet,
  Aks,
  Ambassador,
  Prometheus,
  Jaeger,
  ObservabilityElastic,
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

const cloud = createFractalCloudClient(credentials);

/**
 * The gateway's Host settings, which the agent requires before it will create
 * the Ambassador Host: an owner email, the ACME authority to request a
 * certificate from, and the Secret the certificate is kept in.
 *
 * `acmeProviderAuthority: 'none'` disables ACME. A public certificate authority
 * cannot issue for a bare load-balancer IP, and this sample brings no DNS name
 * of its own, so asking for one would only produce a certificate that never
 * arrives. Set a `host` you own and point the authority at
 * `https://acme-v02.api.letsencrypt.org/directory` to get a real certificate.
 *
 * Declared as a value rather than inline because the SDK's `Ambassador` offer
 * config models only `namespace` today; the remaining keys are the ones its
 * published parameter contract (`AmbassadorOnKubernetesInstantiatorStrategy`)
 * requires. Passing them through a typed value is what keeps them off an object
 * literal, which TypeScript would reject as excess properties.
 */
const gatewayConfig = {
  namespace: 'ambassador',
  hostOwnerEmail: process.env['GATEWAY_OWNER_EMAIL'] ?? 'platform@example.com',
  acmeProviderAuthority: 'none',
  tlsSecretName: 'platform-gateway-tls',
};

async function main() {
  const fractal = authorFractal();
  const liveSystem = fractal.specialize().toLiveSystem({
    name: 'basic-observability',
    environment,
    // ── The ONLY cloud-specific lines: one offer per component. ──
    select: {
      'platform-network': AzureVnet({}),
      'platform-subnet': AzureSubnet({}),
      'platform-cluster': Aks({}),
      // Each capability gets its own namespace. The gateway's namespace is the
      // one the agent looks in for the gateway's own service when it resolves
      // the public host every console is published on.
      'platform-gateway': Ambassador(gatewayConfig),
      monitoring: Prometheus({namespace: 'monitoring'}),
      tracing: Jaeger({namespace: 'tracing'}),
      logging: ObservabilityElastic({namespace: 'logging'}),
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
  // A blueprint and a LiveSystem are different entities. Register the
  // reusable, vendor-agnostic blueprint first; the API rejects a LiveSystem
  // whose Fractal is not registered.
  await cloud.blueprints.create(fractal);
  await cloud.liveSystems.deploy(liveSystem, {
    mode: (process.env['DEPLOY_MODE'] as 'wait' | 'fire-and-forget') ?? 'wait',
  });
}

main().catch(fatal);
