#!/usr/bin/env bash
#
# deploy.sh — basic_iaas: VirtualNetwork + Subnet + SecurityGroup + two VirtualMachines
#
#   ./deploy.sh              build and deploy the default target (aws)
#   ./deploy.sh <target>     build and deploy a specific target
#
# Targets: aws azure gcp oci hetzner
#
# Configuration is read from ./.env — copy .sample.env to .env and fill it in.
# Variables already exported in the shell win over .env, so CI can inject
# secrets without writing a file.
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

TARGETS=(aws azure gcp oci hetzner)
DEFAULT_TARGET=aws

target="${1:-$DEFAULT_TARGET}"
if [[ "$target" == "-h" || "$target" == "--help" ]]; then
  sed -n '3,/^set -euo/p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//; $d'
  exit 0
fi

valid=false
for t in "${TARGETS[@]}"; do
  if [[ "$t" == "$target" ]]; then
    valid=true
  fi
done
if [[ "$valid" != true ]]; then
  echo "deploy.sh: unknown target '$target' — valid targets: ${TARGETS[*]}" >&2
  exit 2
fi

# --- load .env --------------------------------------------------------------
# KEY=value per line; '#' comments and blank lines are skipped. A variable
# already set in the environment is never overwritten.
if [[ -f .env ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    if [[ -z "$line" || "$line" == '#'* ]]; then
      continue
    fi
    line="${line#export }"
    key="${line%%=*}"
    value="${line#*=}"
    if [[ ! "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
      continue
    fi
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
    if [[ -z "${!key:-}" ]]; then
      export "$key=$value"
    fi
  done < .env
fi

# --- validate configuration -------------------------------------------------
REQUIRED=(SERVICE_ACCOUNT_ID SERVICE_ACCOUNT_SECRET OWNER_ID)
case "$target" in
  oci) REQUIRED+=(OCI_COMPARTMENT_ID) ;;
esac

missing=()
for v in "${REQUIRED[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    missing+=("$v")
  fi
done
if ((${#missing[@]})); then
  echo "deploy.sh: missing required variables: ${missing[*]}" >&2
  echo "deploy.sh: copy .sample.env to .env and fill them in." >&2
  exit 1
fi

# --- build and deploy -------------------------------------------------------
echo "==> npm install"
npm install

echo "==> npm run compile"
npm run compile

echo "==> node build/src/$target.js  (DEPLOY_MODE=${DEPLOY_MODE:-wait})"
exec node "build/src/$target.js"
