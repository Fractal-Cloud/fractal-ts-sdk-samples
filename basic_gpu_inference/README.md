# basic_gpu_inference

Provisions a single **GPU VM that self-hosts an LLM** with the Fractal Cloud
TypeScript SDK. The VM boots, installs the NVIDIA stack, and runs
[vLLM](https://github.com/vllm-project/vllm) serving `Qwen2.5-32B-Instruct` over
an **OpenAI-compatible API** on port 8000 — reachable only from inside the VPC.

This is an on-demand inference backend for workloads that need a private,
flat-cost LLM endpoint on your own hardware instead of a per-token metered API.

## What it provisions

```
VirtualNetwork  (inference-net, 10.0.0.0/16)
└── Subnet      (inference-subnet, 10.0.1.0/24)
    └── vllm-host — GPU VM (a2-highgpu-1g = 1× A100 40 GB)
                    userData installs NVIDIA driver + toolkit, runs vLLM :8000
SecurityGroup   (inference-sg)
    └── ingress: TCP 22 (SSH) from 0.0.0.0/0
    └── ingress: TCP 8000 (vLLM) from 10.0.0.0/16  ← internal only, no public model port
    └── the VM is a member via a membership link
```

All structure and guardrails — CIDRs, the internal-only model port, the VM
dependency on the subnet — are declared once in `fractal.ts` and are vendor
neutral. The GPU-specific choices `gcp.ts` makes are the VM `machineType` (the
A100 box) and the `userData` first-boot script. vLLM has no built-in auth, so
the security group — **not** the app — is what keeps port 8000 private to the
VPC.

## Self-bootstrap via `userData`

The vLLM bootstrap (NVIDIA driver + `docker run vllm/vllm-openai …`) lives in
[`vllm-bootstrap.sh`](./vllm-bootstrap.sh) and is passed to the VM declaratively
through the offer's `userData` field:

```ts
GcpVm({machineType: 'a2-highgpu-1g', userData: <vllm-bootstrap.sh contents>})
```

`gcp.ts` reads the script file at deploy time and hands it to the offer, so the
box self-bootstraps on first boot — no manual metadata step. `userData` is
accepted on every VM offer (`GcpVm` / `Ec2Instance` / `AzureVm` /
`HetznerServer`, etc.).

## Project layout

```
src/
  fractal.ts        # Cloud-agnostic blueprint — ALL structure + guardrails.
                    #   Abstract Components only (VirtualNetwork, Subnet,
                    #   SecurityGroup, VirtualMachine). No vendor, no offer.
  gcp.ts            # Self-contained GCP entrypoint — selects offers, GPU
                    #   machineType, and the userData bootstrap script.
vllm-bootstrap.sh   # First-boot script: NVIDIA stack + vLLM. Read by gcp.ts and
                    #   passed to the VM via userData.
```

`gcp.ts` is the only place a vendor is named. To retarget another cloud, copy it
and swap the offers (`Ec2Instance` / `AzureVm` / `HetznerServer`) and the size
key (`instanceType` / `serverType`).

## Model / GPU sizing

| Choice | Value | Note |
|--------|-------|------|
| Model | `Qwen/Qwen2.5-32B-Instruct-AWQ` | 4-bit, ~20 GB; strong enough for structured-output / JSON-schema tasks |
| GPU | `a2-highgpu-1g` (1× A100 40 GB) | on-demand; needs A100 quota in the region (e.g. `us-central1`) |
| Served name | `Qwen/Qwen2.5-32B-Instruct` | point your client's model id at this |
| Port | 8000 | OpenAI-compatible: `POST /v1/chat/completions` |

To serve the larger `Qwen2.5-72B-AWQ` (~40 GB), bump `machineType` to
`a2-highgpu-2g` (2× A100) and add `--tensor-parallel-size 2` to the vLLM args.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SERVICE_ACCOUNT_ID` | yes | Fractal Cloud service account ID |
| `SERVICE_ACCOUNT_SECRET` | yes | Fractal Cloud service account secret |
| `OWNER_ID` | yes | UUID of the Fractal Cloud owner |
| `ENVIRONMENT_NAME` | no | Target environment name (default: `dev`) |
| `BC_NAME` | no | Bounded-context name (default: `wizard`) |
| `DEPLOY_MODE` | no | `wait` (default) or `fire-and-forget` |

## Running

```bash
npm install
npm run compile

export SERVICE_ACCOUNT_ID=<id>
export SERVICE_ACCOUNT_SECRET=<secret>
export OWNER_ID=<uuid>

node build/src/gcp.js
```

Deploys in `wait` mode — blocks until the live system is Active (or exits
non-zero on failure). The NVIDIA driver + model download add several minutes on
first boot **after** the VM is Active, so poll the endpoint before sending load:

```bash
# from inside the VPC (e.g. the client VM), once the box has finished booting:
curl http://<vllm-host-internal-ip>:8000/v1/models
```

## Using the endpoint

Any OpenAI-compatible client works — point the base URL at the host and the
model id at the served name:

```bash
export OPENAI_BASE_URL=http://<vllm-host-internal-ip>:8000/v1
export OPENAI_MODEL=Qwen/Qwen2.5-32B-Instruct
```

## Lint and type-check

```bash
npm run lint   # check
npm run fix    # auto-format
```
