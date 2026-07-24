/**
 * fractal.ts — the ARCHITECT (CCoE) authors this ONCE.
 *
 * A vendor-AGNOSTIC Fractal for a single-node GPU inference host: a virtual
 * network, a subnet, a security group, and one VirtualMachine that will serve a
 * self-hosted LLM over an OpenAI-compatible HTTP API (vLLM). The box also
 * reads/writes a results bucket and calls an external OpenAI-compatible API —
 * both wired DECLARATIVELY via links, with no hand-attached service account and
 * no secrets in the blueprint. The blueprint names only abstract Components —
 * never a vendor or an offer. The GPU machine size and the vLLM bootstrap script
 * are OFFER config, chosen per-cloud at selection time (see gcp.ts), NOT here.
 *
 * What lives here:
 *   - STRUCTURE — the components, their DEPENDENCIES (`.dependsOn`) and their
 *     LINKS (`bp.link`). The blueprint owns all structure.
 *   - GUARDRAILS — infra parameters the architect locks at design time: the
 *     network/subnet CIDRs and the security-group posture. A consuming dev cannot
 *     override them.
 *
 * What does NOT live here:
 *   - VENDOR PARAMETERS — machineType (the GPU box), userData (the vLLM
 *     bootstrap), image, etc. are OFFER config, passed at selection time in
 *     gcp.ts. Never on the blueprint.
 *   - OPERATIONS — this pattern exposes no application-level verbs, so
 *     `operations` is omitted and `.specialize()` carries no ops.
 *
 * Imported from the locked model surface: '@fractal_cloud/sdk/model'.
 */
import {
  createFractal,
  VirtualNetwork,
  Subnet,
  SecurityGroup,
  VirtualMachine,
  ObjectStorage,
  Unmanaged,
  type ObjectStorageLink,
  type UnmanagedLink,
} from '@fractal_cloud/sdk/model';

const boundedContextId = {
  ownerType: 'Personal',
  ownerId: process.env['OWNER_ID'] ?? '',
  name: process.env['BC_NAME'] ?? 'wizard',
};

/**
 * The security group deliberately keeps the model port INTERNAL. vLLM's
 * OpenAI-compatible server ships with no authentication, so port 8000 is opened
 * only to the VPC CIDR — a client running inside the same network (e.g. another
 * internal service) can reach it, but it is never exposed to the internet.
 * SSH stays open for administration; tighten `SSH_SOURCE_CIDR` to your admin
 * range in a real deployment.
 */
const VPC_CIDR = '10.0.0.0/16';
const SSH_SOURCE_CIDR = '0.0.0.0/0';
const VLLM_PORT = 8000;

/**
 * Author the "GPU inference host" Fractal. Returns a reusable, immutable Fractal —
 * `.specialize()` never mutates it, so it is safe to author once and instantiate
 * many times (see gcp.ts).
 */
export function authorFractal() {
  return createFractal({
    id: 'gpu-inference',
    version: {major: 1, minor: 0, patch: 0},
    description:
      'A single GPU VM serving a self-hosted LLM (vLLM) over an OpenAI-compatible API.',
    boundedContextId,
    blueprint: bp => {
      // ── Virtual network — address space is a governed guardrail. ──
      const network = bp.add(
        VirtualNetwork({
          id: 'inference-net',
          displayName: 'Inference Network',
        }).withCidrBlock(VPC_CIDR),
      );

      // ── Subnet — carved from the network CIDR; depends on it. ──
      const subnet = bp.add(
        Subnet({id: 'inference-subnet', displayName: 'Inference Subnet'})
          .withCidrBlock('10.0.1.0/24')
          .dependsOn(network),
      );

      // ── Security group — governed perimeter: SSH for admin, and the vLLM
      //    port open ONLY to the VPC CIDR (no public model endpoint). ──
      const securityGroup = bp.add(
        SecurityGroup({
          id: 'inference-sg',
          displayName: 'Inference Security Group',
        })
          .withIngressRules([
            {fromPort: 22, toPort: 22, sourceCidr: SSH_SOURCE_CIDR}, // guardrail: SSH admin
            {fromPort: VLLM_PORT, toPort: VLLM_PORT, sourceCidr: VPC_CIDR}, // guardrail: vLLM, internal only
          ])
          .dependsOn(network),
      );

      // ── GPU host — the VM that serves the model. A Linux box in the subnet
      //    (depends on it). Its GPU machine size and the vLLM bootstrap are
      //    offer config, chosen in gcp.ts. ──
      const gpuHost = bp.add(
        VirtualMachine({id: 'vllm-host', displayName: 'vLLM GPU Host'})
          .withOsType('linux')
          .dependsOn(subnet),
      );

      // ── Results bucket — where the box writes eval outputs and reads inputs.
      //    Abstract ObjectStorage; the offer (a GCS bucket) is chosen in gcp.ts. ──
      const resultsBucket = bp.add(
        ObjectStorage({
          id: 'results-bucket',
          displayName: 'Eval Results Bucket',
        }),
      );

      // ── External AI service — an OpenAI-compatible API Fractal does NOT
      //    provision. It only holds a REFERENCE to the API key (an environment
      //    secret); the offer wires that reference in gcp.ts. ──
      const openai = bp.add(
        Unmanaged({id: 'openai', displayName: 'OpenAI API'}),
      );

      // ── Links (runtime relationships, distinct from dependencies). ──

      // The host joins the security group. Membership needs no settings — the
      // presence of the link is the only signal the agent needs.
      bp.link(gpuHost, securityGroup);

      // The host reads AND writes the bucket. The agent ensures the VM has an
      // identity, grants it a bucket role SCOPED by `access` (least-privilege —
      // no broad cloud-platform scope), and publishes the bucket URI to the box.
      bp.link(gpuHost, resultsBucket, {
        access: 'read-write',
      } satisfies ObjectStorageLink);

      // The host consumes the external OpenAI API. The agent injects the config
      // plus a secret REFERENCE (never the raw key) under the OPENAI_ prefix.
      bp.link(gpuHost, openai, {envPrefix: 'OPENAI'} satisfies UnmanagedLink);

      return {network, subnet, securityGroup, gpuHost, resultsBucket, openai};
    },

    // No `operations`: this pattern has no application-level verbs to expose.
    // Everything here is a guardrail (locked) or offer config (chosen in gcp.ts).
  });
}
