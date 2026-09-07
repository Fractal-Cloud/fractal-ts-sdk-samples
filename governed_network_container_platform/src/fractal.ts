/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * MOLECULE MODE. This blueprint declares a cluster and a workload and NOTHING
 * about networking: no VirtualNetwork, no Subnet, no SecurityGroup, and no
 * `dependsOn` pointing at any of them. That absence is not an omission — it IS
 * the mode. The environment already owns a governed network (the spoke the
 * platform provisions per environment, the AWS Cloud Adoption Framework /
 * Well-Architected shape), and a LiveSystem with no network components of its
 * own is placed into it.
 *
 * Its pair, `../basic_container_platform`, is ATOM MODE: the same cluster and
 * workload, but the blueprint brings its own VirtualNetwork + Subnet +
 * SecurityGroup and every component hangs off them. Both are legitimate and
 * both can run a private cluster — what differs is who is responsible for the
 * network path the reconciling agent needs to the API server. In molecule mode
 * the environment provides it — on AWS with the condition the README's AWS note
 * sets out, so do not read this as "molecule ⇒ private on AWS"; in atom mode the
 * blueprint author provides it (see ../basic_container_platform/PRIVATE_CLUSTER.md).
 * The READMEs of both samples say when to pick which.
 *
 * How the SDK expresses the choice: it does not. There is no molecule flag, no
 * `useEnvironmentNetwork()`, no offer config naming the spoke — the SDK's
 * ContainerPlatform node has only `withNodePools` / `withKubernetesVersion` /
 * `withNetworkPolicyProvider` / `dependsOn`, and `toLiveSystem` validates
 * offer-to-component fit and nothing about topology. The mode is carried purely
 * by which components the blueprint contains. The RECONCILING AGENT reads that:
 * with no Subnet dependency it resolves the environment spoke's own per-AZ
 * private subnets, and with one it uses the subnet the blueprint declared.
 *
 * Two kinds of specialization live here, as in every sample:
 *   - GUARDRAILS — `.withXxx()` at design time, LOCKED against the consuming
 *     dev. Here: the node pool topology and autoscaling range.
 *   - OPERATIONS — the typed Interface, APPLICATION-level verbs only: which
 *     image the workload ships, which port it listens on, how many replicas.
 *
 * Imported from the locked model surface: '@fractal_cloud/sdk/model'.
 */
import {
  createFractal,
  ContainerPlatform,
  Workload,
} from '@fractal_cloud/sdk/model';

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'wizard',
};

/**
 * Author the "governed network container platform" Fractal. Returns a reusable,
 * immutable Fractal: `.specialize()` never mutates it, so it is safe to author
 * once and instantiate many times (see <cloud>.ts).
 */
export function authorFractal() {
  return createFractal({
    id: 'governed-network-container-platform',
    version: {major: 1, minor: 0, patch: 0},
    description:
      'Governed container platform in MOLECULE mode: a managed cluster placed ' +
      "in the environment's own network, plus a Kubernetes workload running " +
      'inside it. The blueprint declares no network of its own.',
    boundedContextId,
    blueprint: bp => {
      // ── Managed cluster — node pool topology + autoscaling are governed. ──
      //
      // No `.dependsOn(subnet)`, because there is no subnet to depend on. The
      // ids are still specific to this sample rather than generic: on AWS the
      // cluster is NAMED after the component id, on Azure the cluster's subnet
      // is `snet-<component id>` inside the spoke VNet, and on GCP the cluster
      // takes the id too — so a generic id such as 'app-cluster' would collide
      // with the atom sample the moment both run in one environment.
      const cluster = bp.add(
        ContainerPlatform({
          id: 'governed-app-cluster',
          displayName: 'Governed Application Cluster',
        }).withNodePools([
          {
            name: 'system',
            minNodeCount: 1,
            maxNodeCount: 3,
            autoscalingEnabled: true,
          }, // guardrail: cluster capacity is an infra decision
        ]),
      );

      // ── The in-cluster workload — a container running ON the cluster above.
      //    Its ONE dependency is the cluster: that edge is how the reconciling
      //    agent finds the cluster to deploy into. Pod networking is the
      //    cluster's, so there is nothing else for it to depend on or link to
      //    even in atom mode — which is exactly why this pairing isolates the
      //    network question and changes nothing else. ──
      const workload = bp.add(
        Workload({
          id: 'governed-cluster-workload',
          displayName: 'In-Cluster Workload',
        }).dependsOn(cluster),
      );

      return {cluster, workload};
    },

    // ── OPERATIONS — application-level verbs only. ──
    operations: s => ({
      /**
       * The container image the workload ships.
       *
       * The param key is `containerImage`, not `image`. That is the published
       * contract of the `CustomWorkloads.CaaS.KubernetesWorkload` offer, in
       * both places that publish one — the catalogue and the agent that owns
       * the offer — and the keys are `containerImage` / `containerPort` /
       * `replicas` / `namespace`. Pass a FULLY-QUALIFIED image: the agent
       * prefixes a host-less image (one whose first path segment carries no
       * `.` or `:`) with the environment's own container registry, which a
       * public image is not in.
       */
      withImage: (image: string) => s.workload.set('containerImage', image),
      /** The port the workload listens on. */
      withPort: (port: number) => s.workload.set('containerPort', port),
      /** How many replicas of the workload to run. */
      withReplicas: (replicas: number) => s.workload.set('replicas', replicas),
    }),
  });
}
