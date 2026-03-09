# basic_ecs

Demonstrates a secure two-tier ECS Fargate workload using the Fractal Cloud TypeScript SDK.

## What it provisions

```
VPC (10.0.0.0/16)
└── Private Subnet (10.0.1.0/24, eu-central-1a)
│   ├── web-service   ECS Fargate  2 tasks  nginx:alpine       port 80
│   └── api-service   ECS Fargate  2 tasks  amazonlinux:latest port 8080
└── Security Group
    └── ingress: TCP 80 from 0.0.0.0/0 (public HTTP)
    └── ingress: TCP 8080 from 10.0.0.0/16 (internal VPC only)

ECS Cluster (app-cluster)
├── web-service (deps: cluster + web-task + subnet)
└── api-service (deps: cluster + api-task + subnet)

ECS Task Definitions (region-scoped, no VPC deps)
├── web-task   256 CPU / 512 MB   nginx:alpine
└── api-task   512 CPU / 1024 MB  amazonlinux:latest
```

**Network rules** are declared in the blueprint:
- `web-service → api-service` on port 8080 — the agent creates managed SG egress/ingress rules automatically
- Both services are members of `app-sg` via explicit security group links
- No public IPs assigned to any task (`assignPublicIp: false`)

## Project layout

```
src/
  fractal.ts      # Cloud-agnostic blueprint: cluster, task defs, services, network
  live_system.ts  # AWS-specific: launch type, AZ, IAM role ARNs
  index.ts        # Entry point
```

### Blueprint / Live System split

| Concern | Declared in |
|---------|-------------|
| Container image, CPU, memory | `fractal.ts` — `EcsTaskDefinition.create()` |
| Desired replica count | `fractal.ts` — `EcsService.create()` |
| Service-to-service traffic rules (port links) | `fractal.ts` — `.withLinks()` |
| Security group membership | `fractal.ts` — `.withSecurityGroups()` |
| Ingress rules | `fractal.ts` — `SecurityGroup.create({ ingressRules })` |
| Fargate launch type, assignPublicIp | `live_system.ts` — `.withLaunchType()` / `.withAssignPublicIp()` |
| IAM execution / task role ARNs | `live_system.ts` — `.withExecutionRoleArn()` / `.withTaskRoleArn()` |
| Availability zone | `live_system.ts` — `.withAvailabilityZone()` |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | yes | kebab-case target environment, e.g. `dev` |
| `ECS_EXECUTION_ROLE_ARN` | no | IAM execution role ARN for ECS tasks (defaults to a placeholder) |
| `ECS_TASK_ROLE_ARN` | no | IAM task role ARN for the API service (defaults to a placeholder) |

## Running

```bash
npm install
npm run compile
```

Export the required environment variables, then run:

```bash
export SERVICE_ACCOUNT_ID=<your-service-account-id>
export SERVICE_ACCOUNT_SECRET=<your-service-account-secret>
export OWNER_ID=<your-owner-uuid>
export ENVIRONMENT_NAME=dev
export ECS_EXECUTION_ROLE_ARN=arn:aws:iam::<account>:role/ecsTaskExecutionRole
export ECS_TASK_ROLE_ARN=arn:aws:iam::<account>:role/ecsApiTaskRole   # optional

node build/src/index.js
```

Lint and type-check:

```bash
npm run lint      # check
npm run fix       # auto-format
```
