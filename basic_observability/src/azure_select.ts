/**
 * azure_select.ts — the Azure offer for every component of the observability
 * Fractal. Kept apart from azure.ts so a test can build the LiveSystem without
 * deploying it.
 *
 * Why the observability offers still say CaaS while the cluster says Azure:
 * Prometheus, Jaeger and OpenSearch are vendor-neutral — they are Kubernetes
 * workloads and run the same way on any cluster. What is cloud-specific is the
 * cluster they land on and the network it sits in, so those are the components
 * that take Azure offers here.
 *
 * Why the gateway is Ambassador and not AzureApiManagement: the agent's
 * observability code integrates with an IN-CLUSTER gateway. Prometheus publishes
 * Grafana, Prometheus and Alertmanager by creating Ambassador Mappings, a path
 * guarded by `type.endsWith("Ambassador")`. A managed gateway is not recognized as the
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
  StorageOpenSearch,
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
 * The trace store. aria-agent-caas-k8s installs OpenSearch on the cluster and
 * makes Jaeger its own user, with the credentials in a Secret in Jaeger's
 * namespace. Sized for a sample: one node with a 10Gi volume instead of the
 * offer's three nodes of 100Gi each.
 */
const traceStoreConfig = {
  namespace: 'opensearch',
  replicas: 1,
  storage: '10Gi',
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
    'trace-store': StorageOpenSearch(traceStoreConfig),
    tracing: Jaeger({namespace: 'tracing'}),
  };
}
