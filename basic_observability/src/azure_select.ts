/**
 * azure_select.ts — the Azure offer for every component of the observability
 * Fractal. Kept apart from azure.ts so a test can build the LiveSystem without
 * deploying it.
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
import {
  AzureVnet,
  AzureSubnet,
  Aks,
  Ambassador,
  Prometheus,
  Jaeger,
  ObservabilityElastic,
} from '@fractal_cloud/sdk/model';

/**
 * The gateway. aria-agent-caas-k8s installs it (Emissary-ingress) and publishes
 * it as Service `edge-stack` in this namespace, which is where the observability
 * offers look for it. Set `host` to a DNS name you own to publish the consoles
 * on it instead of on the load balancer's address; caas-k8s creates no TLS Host
 * or certificate yet.
 */
const gatewayConfig = {
  namespace: 'ambassador',
};

/**
 * The Elastic stack's settings. The agent's published contract for
 * `Observability.CaaS.Elastic` REQUIRES `elasticVersion`, `elasticInstances` and
 * `storage` and defaults none of them; without them the component never leaves
 * Instantiating ("Elastic version parameter is missing").
 *
 * - `elasticVersion` must be a tag the agent's image mirror carries for
 *   elasticsearch, kibana and apm-server alike; 8.5.3 is the line the agent's
 *   ECK operator (2.5.0) shipped with.
 * - `memory` and `cpu` are unit counts the agent multiplies (4G and 2000m each),
 *   so the smallest explicit size is larger than any node this sample's
 *   cluster gets. 0 leaves the pod to the ECK operator's own defaults.
 *
 * Declared as a value rather than inline: the SDK's offer config models only
 * `namespace` and `elasticVersion`, and TypeScript rejects the other keys as
 * excess properties on an object literal.
 */
export const loggingConfig = {
  namespace: 'logging',
  elasticVersion: '8.5.3',
  elasticInstances: 1,
  storage: '10Gi',
  memory: 0,
  cpu: 0,
};

/** One offer per component. The ONLY cloud-specific lines in the sample. */
export function azureSelect() {
  return {
    'acme-observability-network': AzureVnet({}),
    'platform-subnet': AzureSubnet({}),
    'platform-cluster': Aks({}),
    // Each capability gets its own namespace. The gateway's namespace is the
    // one the agent looks in for the gateway's own service when it resolves
    // the public host every console is published on.
    'platform-gateway': Ambassador(gatewayConfig),
    monitoring: Prometheus({namespace: 'monitoring'}),
    tracing: Jaeger({namespace: 'tracing'}),
    logging: ObservabilityElastic(loggingConfig),
  };
}
