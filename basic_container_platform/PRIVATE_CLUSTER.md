# Making an atom-mode private cluster reachable by the agent

Atom mode — this sample — means you bring your own network, and with it the
responsibility for making the cluster work with the reconciling agent. This page
is how you discharge that responsibility, in two parts:

> **The SDK has no components for any of this today.** There is no peering, route,
> route-table, DNS-zone-association or resolver atom in `@fractal_cloud/sdk` — the
> evidence is two sections down. That absence is the useful finding here, and it is
> what makes the second half of this page a manual procedure rather than a sample.

1. **What you compose in the blueprint** — the atoms that place a private cluster
   in your own network, each one named with what it contributes.
2. **What you build in your cloud account by other means** — the peering, the
   routing and the name resolution, because **no atom exists for either half of
   that today**. The second section says so plainly, with the evidence, so you do
   not go looking for a setter that is not there.

## Composing the atoms: what you write, and what each atom contributes

Atom mode means you compose the pieces rather than receive them assembled. Here is
the composition for a private cluster in your own network — every line below
type-checks against `@fractal_cloud/sdk` 2.7.0 and was built offline to confirm the
components it emits:

```ts
blueprint: bp => {
  // ATOM 1 — VirtualNetwork. Contributes: your own address space. The CIDR is the
  // load-bearing choice, not a formality: it must NOT overlap the environment's
  // spoke, or the peering you create later cannot be established at all.
  const network = bp.add(
    VirtualNetwork({id: 'acme-own-network'}).withCidrBlock('10.190.0.0/16'),
  );

  // ATOMS 2 and 3 — two Subnets, in two Availability Zones. Contributes: the
  // placement the cluster reads. TWO of them, because a managed Kubernetes
  // control plane wants node subnets in at least two zones; the zone itself is
  // offer config (`AwsSubnet({availabilityZone})`), not a blueprint concern.
  const az1 = bp.add(
    Subnet({id: 'acme-nodes-az1'}).withCidrBlock('10.190.1.0/24').dependsOn(network),
  );
  const az2 = bp.add(
    Subnet({id: 'acme-nodes-az2'}).withCidrBlock('10.190.2.0/24').dependsOn(network),
  );

  // ATOM 4 — ContainerPlatform, depending on BOTH subnets. Contributes: the
  // cluster, and the fact that it lands in YOUR network. Those two dependency
  // edges are the whole of atom mode: the agent resolves node subnets from them
  // instead of from the environment spoke.
  const cluster = bp.add(
    ContainerPlatform({id: 'acme-private-cluster'})
      .dependsOn(az1)
      .dependsOn(az2)
      .withNodePools([{name: 'system', minNodeCount: 1, maxNodeCount: 3,
                       autoscalingEnabled: true}]),
  );

  // ATOM 5 — the Workload on it. Contributes: something to run. Its one edge to
  // the cluster is how the agent finds where to deploy it.
  const workload = bp.add(
    Workload({id: 'acme-private-workload'}).dependsOn(cluster),
  );

  return {network, az1, az2, cluster, workload};
},

operations: s => ({
  // NOTE there is no posture operation here, deliberately. The agents read a
  // `privateClusterDisabled` parameter whose default is false, so a blueprint
  // that sets nothing already carries the private INTENT — an operation setting
  // it to false would be a no-op named as if it did something.
  //
  // The only useful operation on this parameter is the ESCAPE HATCH, and it is
  // named for what it actually does. There is no typed setter, but an operation
  // may carry any parameter:
  //
  //   withPublicApiServer: () => s.cluster.set('privateClusterDisabled', true),
  //
  // Read `privateClusterDisabled` as the parameter's default intent, not as the
  // outcome: on AWS the realised posture is decided at create time from whether
  // the agent shares the cluster's VPC (see "One thing to be precise about" in
  // the molecule sample's README), and any failure to measure that leaves the
  // public endpoint on.
  withImage: (image: string) => s.workload.set('containerImage', image),
}),
```

Selected per cloud the usual way — the zone pinning is the only thing here that
differs from any other sample:

```ts
select: {
  'acme-own-network': AwsVpc({}),
  'acme-nodes-az1': AwsSubnet({availabilityZone: 'eu-central-1a'}),
  'acme-nodes-az2': AwsSubnet({availabilityZone: 'eu-central-1b'}),
  'acme-private-cluster': Eks({}),
  'acme-private-workload': K8sWorkload({namespace: 'acme'}),
}
```

That composition emits five components: an `AwsVpc`, two `AwsSubnet`s carrying
their `availabilityZone`, an `AwsEks` depending on both, and a
`KubernetesWorkload` depending on the cluster.

## The atoms that do not exist — read this before you look for them

**Neither half of reachability has an atom today.** This is stated plainly rather
than left for you to discover: the composition above places a private cluster in
your network, and it does **not** make that cluster reachable by the agent.

Checked by dumping every export of the installed package —
`Object.keys(require('@fractal_cloud/sdk/model'))` returns **136 names**: 25
abstract components, their vendor offers, the client, the Environment surface and
helpers. **None of these appears, by name or by concept:**

| Missing atom | Which half it would serve |
|---|---|
| network peering / VPC peering / VNet peering | the route |
| transit gateway, gateway attachment | the route |
| route, route table | the route |
| DNS zone association, private hosted zone, resolver rule or endpoint | **the resolution** |
| VPC endpoint / PrivateLink | either |

The network atoms that exist — `VirtualNetwork`, `Subnet`, `SecurityGroup` and
their per-vendor offers — compose **a** network. They do not compose an edge
**between** two networks, and nothing in the set touches name resolution.

**And the `SecurityGroup` atom will not open the API server either.** It exists,
but no managed-cluster offer reads it. The AWS cluster component resolves exactly
one dependency type — `Subnet` — and never a security group or a link; the
cluster's security group is the one EKS creates for itself. The Azure cluster
resolves a VNet dependency (directly, or one hop through a Subnet) and reads no
NSG. So authorizing 443 towards the control plane is not expressible either, and
is listed below as your work.

The only DNS surface in this SDK is zone *registration*: `withDnsZones` on an
Environment — a control-plane resource, not part of any blueprint — taking
`{name, dnsZoneType?}`. There is no component-level DNS surface at all: no export
matches `/dns/i`, and `DnsZone` carries no record field. Registering a zone does
not associate a cloud-generated private zone — the one holding your API server's
hostname — with another network, which is what the resolution half needs.

So the rest of this page is a **manual, out-of-band procedure in your own cloud
account**. That is the honest shape of it today; if the atoms arrive, this page
becomes a sample.

## The two halves

The agent needs **both** of these to reconcile a private cluster. They are
independent, and the second is the one people forget:

1. **A route** from the agent's network to the cluster's API endpoint.
2. **Resolution of the endpoint's name** from the agent's network.

**DNS does not follow connectivity.** A cloud that puts the API server's name in
a private zone scoped to the cluster's own network will not resolve that name for
you just because you peered the two networks — the packets could get there, but
nothing tells the resolver where "there" is. This platform has hit that on two
clouds; treat half 2 as a separate task with its own verification, never as a
consequence of half 1.

## Where the agent actually sits

What you are peering *to*, per cloud.

Every environment gets one spoke network of its own, named `{environment-short-name}-vpc`
on AWS. **The agents, however, are deployed only into MANAGEMENT environments** —
an operational environment gets a spoke and a transit-gateway attachment, not
agents — so "the agent's network" always means **the management environment's
spoke**. The agents are not in your network and they are not on the public
internet:

| Cloud | The agent's network position |
|---|---|
| **AWS** | Both the cloud agent and the `caas-k8s` agent run as **ECS services in the management environment's spoke VPC**, in its **private** subnets, with **no public IP** (`AssignPublicIp` is a compile-time `false` for both). Spokes attach to the environment's **Transit Gateway** |
| **Azure** | The agents are **App Services with VNet integration** into a dedicated delegated `snet-agents` subnet (a /26) in the **management spoke VNet**. Spokes are peered **bidirectionally to the management hub VNet**, with forwarded traffic allowed so spoke↔spoke transits the hub |
| **GCP** | The agent reaches clusters from a **Serverless VPC Access connector** in the **management** environment; its CIDR is published as an environment parameter and is the only entry in a GKE cluster's master-authorized-networks list |

Ask the platform team for the management environment's network identifiers — the
VPC/VNet id and the agent subnet CIDRs. You need them for both halves, and they
are not derivable from anything in your own account.

## AWS — EKS

Both halves are real work here, and half 2 is the harder one.

**Half 1 — route.** Give the agent's spoke VPC a path to your VPC: attach your
VPC to the environment's Transit Gateway (the same mechanism the platform's own
spokes use) or peer it directly to `{environment-short-name}-vpc`. Routes on both
sides, and no overlapping CIDRs.

**Half 2 — resolution.** EKS associates the API server's Route 53 **private
hosted zone with the cluster's VPC only**. An agent in a different VPC cannot
resolve the API-server hostname *however well the two VPCs are routed*. Pick one:

- **Associate the private hosted zone with the agent's VPC.** Across accounts this
  is two calls — `route53 create-vpc-association-authorization` in the cluster's
  account, then `route53 associate-vpc-with-hosted-zone` from the agent's. The
  zone is the one EKS created for the cluster endpoint; find it by the endpoint
  hostname from `eks describe-cluster`.
- **Or forward the name.** A Route 53 Resolver **inbound** endpoint in the
  cluster's VPC plus an **outbound** endpoint and forwarding rule in the agent's,
  for the endpoint's domain.

**Also yours: the security group.** When the agent is in the cluster's VPC the
platform authorizes 443 from the agent's security group onto the cluster security
group automatically. It discovers the agent's group by matching the agent's own
network interface *within the cluster's VPC*, so in atom mode that lookup finds
nothing and the platform logs that it cannot help. **Authorize TCP 443 on the
cluster security group from the agent's security group or its subnet CIDRs
yourself.**

**On the posture itself.** The platform chooses an EKS cluster's endpoint posture
at creation time, from whether it can *measure* a private path — and EKS only
accepts a posture change afterwards through an operator-run `UpdateClusterConfig`.
Recognizing an author-provided path is being worked on separately; until it lands,
confirm the intended posture with the platform team rather than assuming a
particular default. Setting `privateClusterDisabled: true` is the opposite
request — it asks for a reachable public endpoint — so do not set it expecting
privacy.

## Azure — AKS

**Half 2 comes free; half 1 is yours.** A private AKS cluster is the default here
(`privateClusterDisabled` defaults to false), and the platform creates it with the
public FQDN enabled: the cluster's name resolves **publicly** to its **private**
IP address. Resolution therefore works from the agent's network with nothing to
configure — the address it returns is simply unreachable until you build the route.

**Half 1 — route.** Peer your VNet to the environment's spoke VNet (or to the
management hub, mirroring what the platform does for its own spokes:
bidirectional peering with `AllowForwardedTraffic`, cross-subscription allowed
within one tenant, cross-tenant not supported). Then allow **TCP 443** from the
`snet-agents` prefix to the cluster's API server on any NSG or firewall in the
path.

If you turn the public FQDN off, half 2 becomes yours too: link the
`privatelink.<region>.azmk8s.io` private DNS zone to the agent's VNet, or forward
that zone from your own resolver.

## GCP — GKE

**There is no atom-mode cluster to make reachable.** On GCP the cluster is always
created in the **environment's spoke network**: the agent resolves the network
name from the environment and fails loudly (`SPOKE_NETWORK_NOT_PROVISIONED`) if
there is none. A `VirtualNetwork` component you declare in a GCP blueprint is
created, but it never carries the cluster.

The control plane is private-only: the public endpoint is disabled and the
master-authorized-networks list contains exactly one entry, the environment's
Serverless VPC Access connector CIDR. If you need to reach that API server from
your own network, that is a change to the authorized-networks list and to
routing between your network and the spoke — ask the platform team; it is not
something the blueprint expresses.

## Verifying, before you blame the agent

Run these from a host in the agent's network (a bastion in the spoke, or a
throwaway task in the same subnets). Half 2 fails silently as "connection
refused"-looking symptoms if you only test half 1:

```bash
# Half 2 — does the name resolve, and to a PRIVATE address?
dig +short <api-server-hostname>

# Half 1 — is there a route, and is 443 open?
nc -vz <resolved-private-ip> 443
```

Both must pass. A resolved public address, or a resolved private address that
does not answer on 443, are two different failures with two different fixes.

---

See also: [`basic_container_platform/README.md`](./README.md) for what atom mode
is, and [`governed_network_container_platform`](../governed_network_container_platform)
for molecule mode, where providing the agent's path is the platform's job rather
than yours — with one AWS caveat that sample's README is precise about, and which
matters for the same reason as everything above: agents are deployed only into
management environments.
