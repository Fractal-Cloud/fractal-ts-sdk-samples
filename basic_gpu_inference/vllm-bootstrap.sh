#!/usr/bin/env bash
# vllm-bootstrap.sh — first-boot startup script for the GPU VM (vllm-host).
#
# Installs the NVIDIA driver + container toolkit, then runs the vLLM
# OpenAI-compatible server as a restart-on-failure container on port 8000.
# Assumes an Ubuntu 22.04 LTS image. A GCP Deep Learning image ships the driver
# and lets you drop step 1.
#
# gcp.ts reads this file and passes its contents to the VM offer's `userData`
# field, so it runs as the instance startup-script on first boot — no manual
# metadata step.
set -euxo pipefail

MODEL_ID="Qwen/Qwen2.5-32B-Instruct-AWQ"     # 4-bit, ~20 GB; fits one A100 40 GB
SERVED_AS="Qwen/Qwen2.5-32B-Instruct"        # the model name clients request
VLLM_PORT=8000

# 1. NVIDIA driver (Ubuntu). ubuntu-drivers picks the right build for the A100.
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ubuntu-drivers-common curl gnupg
ubuntu-drivers install --gpgpu || apt-get install -y nvidia-driver-535-server

# 2. Docker Engine.
curl -fsSL https://get.docker.com | sh

# 3. NVIDIA Container Toolkit (exposes the GPU to containers).
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
  | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \
  > /etc/apt/sources.list.d/nvidia-container-toolkit.list
apt-get update && apt-get install -y nvidia-container-toolkit
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker

# 4. Serve the model. --ipc=host is required for vLLM's shared-memory tensor ops.
#    Binds 0.0.0.0 inside the box; the security group (fractal.ts) is what keeps
#    the port reachable only from inside the VPC. For Qwen2.5-72B-AWQ use a
#    2×A100 box (a2-highgpu-2g) and add: --tensor-parallel-size 2
docker run -d --restart=always --gpus all --ipc=host -p "${VLLM_PORT}:8000" \
  --name vllm vllm/vllm-openai:latest \
  --model "${MODEL_ID}" \
  --served-model-name "${SERVED_AS}" \
  --quantization awq_marlin \
  --max-model-len 16384 \
  --gpu-memory-utilization 0.92
