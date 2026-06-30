# basic_cicd

A sample demonstrating how to deploy Fractal Cloud infrastructure from a **CI/CD pipeline** using the SDK's `wait` deployment mode.

Unlike fire-and-forget, this sample **blocks** until the Live System reaches `Active` status. The process exits with code `0` on success or code `1` on failure, making it directly usable in any CI/CD system that checks exit codes.

## Project layout

| File | Role |
|---|---|
| `src/fractal.ts` | The architect authors the governed, vendor-agnostic Fractal **once**: abstract Components, locked guardrails (CIDR blocks, ingress rules, links), and structural dependencies. No vendor names appear here. |
| `src/aws.ts` | The CI/CD entry point: a self-contained, runnable file you copy and run. It selects one concrete AWS offer per component, builds the Live System, then deploys in `wait` mode — blocks until Active, exits non-zero on failure. |

## What gets deployed

A basic IaaS network scaffold on AWS, selected via per-component offer mapping in `src/aws.ts`:

| Blueprint component | Selected AWS offer | Governed guardrails |
|---|---|---|
| `VirtualNetwork` (`main-network`) | `AwsVpc` | CIDR `10.0.0.0/16` |
| `Subnet` (`public-subnet`) | `AwsSubnet` | CIDR `10.0.1.0/24`; depends on VPC |
| `SecurityGroup` (`web-sg`) | `AwsSecurityGroup` | Ingress: SSH (22) + HTTP (80) from `0.0.0.0/0` |
| `VirtualMachine` (`api-server`) | `Ec2Instance` | AMI `ami-096a4fdbcf530d8e0`, type `t3.small`; depends on subnet |
| `VirtualMachine` (`web-server`) | `Ec2Instance` | AMI `ami-096a4fdbcf530d8e0`, type `t3.micro`; depends on subnet |

The blueprint also wires a **traffic link**: `web-server → api-server` on TCP 8080. The agent derives the matching managed-SG egress and ingress rules from this link.

## Offer-selection model

The vendor is chosen **at Live System build time**, not at blueprint authoring time. In `src/aws.ts` a `select` map assigns one concrete offer per component ID:

```ts
const select = {
  'main-network': AwsVpc({}),
  'public-subnet': AwsSubnet({}),
  'web-sg': AwsSecurityGroup({}),
  'api-server': Ec2Instance({ amiId: '...', instanceType: 't3.small' }),
  'web-server': Ec2Instance({ amiId: '...', instanceType: 't3.micro' }),
};
```

Swapping any line to a different offer (e.g. `AzureVnet`, `GcpVpc`) retargets that slot with no change to `fractal.ts`. The blueprint is permanently vendor-agnostic.

## Deployment modes

| Mode | Behavior | When to use |
|---|---|---|
| `fire-and-forget` | Submit and return immediately. | Applications, CLIs |
| `wait` | Submit, then poll until `Active`. Throws on failure or timeout. | **CI/CD pipelines** |

This sample uses `wait` mode — the correct shape for a CI/CD gate.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SERVICE_ACCOUNT_ID` | yes | — | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | — | Fractal Cloud service account secret |
| `OWNER_ID` | yes | — | UUID of the Fractal Cloud owner (used in both the bounded context and the environment) |
| `ENVIRONMENT_NAME` | no | `dev` | Kebab-case environment name |

> `BC_NAME` defaults to `wizard` in `fractal.ts` but is not required at runtime.

## Running locally

```bash
npm install
npm run compile

export SERVICE_ACCOUNT_ID=<your-service-account-id>
export SERVICE_ACCOUNT_SECRET=<your-service-account-secret>
export OWNER_ID=<your-owner-id>

node build/src/aws.js      # deploy on AWS
```

The process emits structured `wait`-mode log lines and exits when infrastructure is Active:

```
[2026-01-01T00:00:00Z] INFO  Deploying Live System  system=basic-cicd fractal=basic-cicd provider=AWS
[2026-01-01T00:00:10Z] CHECK Polling Live System status  system=basic-cicd round=1 status=InProgress elapsed=10s
[2026-01-01T00:00:30Z] INFO  Live System Active  system=basic-cicd elapsed=30s
```

If provisioning fails, the error is printed and the process exits with code `1`.

## GitHub Actions example

```yaml
name: Deploy infrastructure

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        working-directory: basic_cicd
        run: npm install

      - name: Compile
        working-directory: basic_cicd
        run: npm run compile

      - name: Deploy infrastructure
        working-directory: basic_cicd
        env:
          SERVICE_ACCOUNT_ID: ${{ secrets.FRACTAL_SERVICE_ACCOUNT_ID }}
          SERVICE_ACCOUNT_SECRET: ${{ secrets.FRACTAL_SERVICE_ACCOUNT_SECRET }}
          OWNER_ID: ${{ secrets.FRACTAL_OWNER_ID }}
          ENVIRONMENT_NAME: prod
        run: node build/src/aws.js
```

The pipeline step fails automatically if deployment fails or times out, preventing any downstream steps from running on broken infrastructure.

## Architecture notes

`fractal.ts` is cloud-agnostic: all structural wiring (dependencies, links, guardrails) lives there and is locked at design time. `aws.ts` is a self-contained entrypoint you copy and run; its inline `select` map is the only vendor-specific code. This separation means the same Fractal can target any provider by writing a new per-cloud entrypoint with a different `select` map, without touching the blueprint.
