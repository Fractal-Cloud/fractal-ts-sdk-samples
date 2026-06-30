# basic_iaas

Demonstrates a cloud-agnostic IaaS workload using the Fractal Cloud TypeScript SDK. The same blueprint deploys on **AWS, Azure, GCP, OCI, or Hetzner** — pick the target provider at runtime with a single environment variable. The vendor is named only when offers are selected; the Fractal itself never changes.

## What it provisions

```
VirtualNetwork  (main-network, 10.0.0.0/16)
└── Subnet      (public-subnet, 10.0.1.0/24)
    ├── web-server  — frontend VM, links to api-server on TCP 8080
    └── api-server  — backend VM
SecurityGroup   (web-sg)
    └── ingress: TCP 22 (SSH), TCP 80 (HTTP) from 0.0.0.0/0
    └── both VMs are members via membership links
```

All structure — CIDR guardrails, ingress rules, dependencies, and the
`web-server → api-server` traffic-rule link on port 8080 — is declared once in
`fractal.ts`. It is carried into every provider's live system automatically: the
agent derives the managed security-group rules from the link settings. No
per-provider rule configuration is needed.

## Project layout

```
src/
  fractal.ts   # Cloud-agnostic blueprint — ALL structure + guardrails.
               #   Abstract Components only (VirtualNetwork, Subnet,
               #   SecurityGroup, VirtualMachine). No vendor, no offer.
  aws.ts       # Self-contained AWS entrypoint — copy and run
  azure.ts     # Self-contained Azure entrypoint — copy and run
  gcp.ts       # Self-contained GCP entrypoint — copy and run
  oci.ts       # Self-contained OCI entrypoint — copy and run
  hetzner.ts   # Self-contained Hetzner entrypoint — copy and run
```

Each `src/<cloud>.ts` is a self-contained, runnable entrypoint. It specializes
the Fractal, then builds the LiveSystem by per-component OFFER SELECTION (the
inline `select` map) and runs deploy(). Pick a cloud by copying and running its
file — there is no provider dispatch.

`fractal.ts` is the source of truth for all structural decisions (dependencies,
traffic rules, security rules, CIDR/ingress guardrails). The per-cloud entrypoint
is the only place a vendor is named: it maps each blueprint component id to a
concrete Offer (`AwsVpc`, `AzureVnet`, `Ec2Instance`, …) plus that offer's vendor
config. The compiler enforces that each selected offer satisfies the Component in
its slot. To retarget a component to another vendor, swap one line in the
`select` map.

## Selecting a provider

Pick a provider by running its entrypoint: `aws.js` · `azure.js` · `gcp.js` · `oci.js` · `hetzner.js`

```bash
node build/src/azure.js
```

Offer config (amiId, vmSize, machineType, shape, serverType, …) is supplied as
literals in the `select` map of each per-cloud entrypoint — edit that map to
change vendor parameters.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | Target environment name (default: `dev`) |
| `BC_NAME` | no | Bounded-context name (default: `wizard`) |
| `OCI_COMPARTMENT_ID` | only for `oci.ts` | OCI compartment OCID for the security list |

Pick a provider by running its entrypoint (`aws.js` · `azure.js` · `gcp.js` · `oci.js` · `hetzner.js`) — there is no provider-selection environment variable.

## Running

```bash
npm install
npm run compile
```

Set the variables above, then run:

```bash
export SERVICE_ACCOUNT_ID=<id>
export SERVICE_ACCOUNT_SECRET=<secret>
export OWNER_ID=<uuid>

node build/src/aws.js      # deploy on AWS
node build/src/azure.js    # deploy on Azure
node build/src/gcp.js      # deploy on GCP
node build/src/hetzner.js  # deploy on Hetzner

# OCI — set the compartment OCID first
export OCI_COMPARTMENT_ID=ocid1.compartment...
node build/src/oci.js      # deploy on OCI
```

The sample deploys in `wait` mode — it blocks until the live system is Active
(or exits non-zero on failure).

## Lint and type-check

```bash
npm run lint   # check
npm run fix    # auto-format
```
</content>
