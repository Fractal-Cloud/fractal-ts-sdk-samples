# basic_cicd

A sample demonstrating how to deploy Fractal Cloud infrastructure from a **CI/CD pipeline** using the SDK's `wait` deployment mode.

Unlike the `basic_iaas` sample (which uses fire-and-forget), this sample **blocks** until the Live System reaches `Active` status. The process exits with code `0` on success or code `1` on failure, making it directly usable in any CI/CD system that checks exit codes.

## What gets deployed

The same IaaS infrastructure as `basic_iaas`, deployed on AWS:

| Blueprint component | AWS component | Notes |
|---------------------|---------------|-------|
| `VirtualNetwork`    | `AwsVpc`      | CIDR `10.0.0.0/16`, DNS support enabled |
| `Subnet`            | `AwsSubnet`   | CIDR `10.0.1.0/24`, configurable AZ |
| `SecurityGroup`     | `AwsSecurityGroup` | Allows SSH (22) and HTTP (80) |
| `VirtualMachine` (web-server) | `Ec2Instance` | Public IP, configurable AMI and type |
| `VirtualMachine` (api-server) | `Ec2Instance` | No public IP, configurable AMI and type |

## Deployment modes

| Mode | Behaviour | When to use |
|------|-----------|-------------|
| `fire-and-forget` | Submit and return immediately. Errors logged but not thrown. | Applications, CLIs |
| `wait` | Submit, then poll until `Active`. Throws on failure or timeout. | **CI/CD pipelines** |

This sample uses `wait` mode. The polling interval and timeout are both configurable.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `SERVICE_ACCOUNT_ID` | yes | — | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | — | Fractal Cloud service account secret |
| `OWNER_ID` | yes | — | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | `dev` | Kebab-case environment name |
| `DEPLOY_TIMEOUT_MS` | no | `600000` | Max wait time in ms (10 min) |
| `DEPLOY_POLL_INTERVAL_MS` | no | `5000` | Polling interval in ms (5 s) |
| `AWS_AVAILABILITY_ZONE` | no | `eu-central-1a` | EC2 subnet availability zone |
| `EC2_AMI_ID` | no | `ami-0970102fe1454052a` | Amazon Linux 2 AMI (eu-central-1) |
| `EC2_INSTANCE_TYPE` | no | `t3.micro` / `t3.small` | EC2 instance type |
| `EC2_KEY_NAME` | no | _(none)_ | EC2 key pair name for SSH; omit to launch without a key pair |

## Running locally

```bash
npm install
npm run compile

export SERVICE_ACCOUNT_ID=<your-service-account-id>
export SERVICE_ACCOUNT_SECRET=<your-service-account-secret>
export OWNER_ID=<your-owner-id>

node build/src/index.js
```

The process prints progress and exits when infrastructure is Active:

```
Registering Fractal blueprint...
Fractal blueprint registered.
Deploying Live System...
Live System is Active. Infrastructure provisioned successfully.
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
          DEPLOY_TIMEOUT_MS: "900000"   # 15 min for production
        run: node build/src/index.js
```

The pipeline step fails automatically if deployment fails or times out, preventing any downstream steps from running on broken infrastructure.

## Architecture notes

The blueprint (`fractal.ts`) is cloud-agnostic and declares all structural wiring. The live system file (`aws_live_system.ts`) contains only AWS-specific parameters. This separation means the same pipeline can target different providers by swapping `aws_live_system.ts` for another provider file without touching the blueprint or deployment logic.
