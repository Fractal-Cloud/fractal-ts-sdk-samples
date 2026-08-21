#!/usr/bin/env bash
#
# Behavior test for the cleanup scripts' scoping.
#
# These scripts run against a customer's own cloud account, which may hold workloads that have
# nothing to do with Fractal Cloud. On AWS and Azure they must therefore touch only what Fractal
# created, identified by the `managed-by` marker tag that every Fractal resource carries from the
# moment it is created. Two values are in play, because two systems provision into the account: the
# environments service during initialization, and the cloud agents on LiveSystem resources.
#
# GCP cannot be scoped that way — the environments service's footprint there is VPC networks,
# subnets, firewall rules and routers, none of which GCP allows a label on — so its scope is the
# project, and the script has to say so plainly before it deletes anything.
#
# This drives each script end-to-end against a stubbed CLI holding one Fractal-owned and one
# customer-owned resource of each kind, and asserts:
#   - a dry run plans deletions for the Fractal resources only
#   - both marker values are honored
#   - EC2-family discovery pushes the tag filter server-side rather than filtering nothing
#   - no script offers a sweep-everything mode, and every one demands a typed identifier to confirm
#
# Requires: bash, timeout (GNU coreutils), jq.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AWS_SCRIPT="${SCRIPT_DIR}/fractal-aws-cleanup.sh"
AZURE_SCRIPT="${SCRIPT_DIR}/fractal-azure-cleanup.sh"
GCP_SCRIPT="${SCRIPT_DIR}/fractal-gcp-cleanup.sh"

PASS=0
FAIL=0
pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

STUB_BIN="$(mktemp -d)"
trap 'rm -rf "$STUB_BIN"' EXIT

# ── A fake `aws` holding one Fractal and one customer resource per service ────
# `--query` is evaluated server-side by the real CLI, so the stub returns what each query would
# have produced rather than raw API payloads — the same shape the az stub in
# cleanup-exit-code.test.sh uses.
cat > "${STUB_BIN}/aws" <<'STUB'
#!/usr/bin/env bash
set -uo pipefail

ARGS="$*"
SERVICE="${1:-}"
OP="${2:-}"

# True when the caller pushed the marker-tag filter into the request (EC2-family server-side filter).
has_tag_filter() { [[ "$ARGS" == *"tag:managed-by"* ]]; }

case "$SERVICE $OP" in
  "sts get-caller-identity")
    echo '{"Account":"111122223333","Arn":"arn:aws:iam::111122223333:role/tester"}' ;;

  "ec2 describe-regions")   echo "us-east-1" ;;

  "ec2 describe-vpcs")
    if [[ "$ARGS" == *"--vpc-ids"* ]]; then
      echo "fractal-vpc"
    elif has_tag_filter; then
      echo "vpc-fractal"
    else
      echo "vpc-fractal	vpc-customer"
    fi ;;

  "ec2 describe-transit-gateways")
    if has_tag_filter; then echo "tgw-fractal"; else echo "tgw-fractal	tgw-customer"; fi ;;

  "ec2 describe-addresses")
    if has_tag_filter; then echo "eipalloc-fractal"; else echo "eipalloc-fractal	eipalloc-customer"; fi ;;

  "ecs list-clusters")
    echo "arn:aws:ecs:us-east-1:111122223333:cluster/fractal-cluster	arn:aws:ecs:us-east-1:111122223333:cluster/customer-cluster" ;;
  "ecs describe-clusters")
    case "$ARGS" in
      *fractal-cluster*)  echo '[{"key":"managed-by","value":"Fractal Cloud"}]' ;;
      *customer-cluster*) echo '[{"key":"team","value":"payments"}]' ;;
      *)                  echo 'null' ;;
    esac ;;
  "ecs list-services")
    case "$ARGS" in
      *fractal-cluster*) echo "arn:aws:ecs:us-east-1:111122223333:service/fractal-cluster/fractal-svc" ;;
      *)                 echo "arn:aws:ecs:us-east-1:111122223333:service/customer-cluster/customer-svc" ;;
    esac ;;
  "ecs list-task-definition-families") echo "fractal-cloud-agent-task" ;;
  "ecs list-task-definitions")
    case "$ARGS" in
      *"--family-prefix"*) echo "arn:aws:ecs:us-east-1:111122223333:task-definition/fractal-cloud-agent-task:1" ;;
      *) echo "arn:aws:ecs:us-east-1:111122223333:task-definition/fractal-cloud-agent-task:1	arn:aws:ecs:us-east-1:111122223333:task-definition/customer-task:1" ;;
    esac ;;

  "elbv2 describe-load-balancers")
    if [[ "$ARGS" == *"--load-balancer-arns"* ]]; then
      case "$ARGS" in *fractal-lb*) echo "fractal-lb" ;; *) echo "customer-lb" ;; esac
    else
      echo "arn:aws:elasticloadbalancing:us-east-1:111122223333:loadbalancer/app/fractal-lb/1	arn:aws:elasticloadbalancing:us-east-1:111122223333:loadbalancer/app/customer-lb/2"
    fi ;;
  "elbv2 describe-target-groups")
    if [[ "$ARGS" == *"--target-group-arns"* ]]; then
      case "$ARGS" in *fractal-tg*) echo "fractal-tg" ;; *) echo "customer-tg" ;; esac
    else
      echo "arn:aws:elasticloadbalancing:us-east-1:111122223333:targetgroup/fractal-tg/1	arn:aws:elasticloadbalancing:us-east-1:111122223333:targetgroup/customer-tg/2"
    fi ;;
  "elbv2 describe-tags")
    # The agents stamp the lower-case marker value; both must be honored.
    case "$ARGS" in
      *fractal-lb*|*fractal-tg*) echo '[{"Key":"managed-by","Value":"fractal-cloud"}]' ;;
      *)                         echo '[{"Key":"owner","Value":"payments"}]' ;;
    esac ;;
  "elbv2 describe-listeners") echo "" ;;

  "resourcegroupstaggingapi get-resources")
    echo "You are not authorized to perform: tag:GetResources" >&2; exit 254 ;;
  "logs describe-log-groups")  echo "fractal-cloud-agent" ;;
  "logs list-tags-log-group")  echo '{"managed-by":"Fractal Cloud"}' ;;

  "rds describe-db-instances")
    echo '{"DBInstances":[
      {"DBInstanceIdentifier":"fractal-db","TagList":[{"Key":"managed-by","Value":"Fractal Cloud"}]},
      {"DBInstanceIdentifier":"customer-db","TagList":[{"Key":"owner","Value":"payments"}]}]}' ;;
  "rds describe-db-clusters")
    echo '{"DBClusters":[
      {"DBClusterIdentifier":"fractal-cluster-db","TagList":[{"Key":"managed-by","Value":"fractal-cloud"}]},
      {"DBClusterIdentifier":"customer-cluster-db","TagList":[]}]}' ;;
  "rds describe-db-subnet-groups") echo "db-subnet-psql-fractal-dev" ;;

  "ecr describe-repositories")
    if [[ "$ARGS" == *"--repository-names"* ]]; then
      case "$ARGS" in
        *fractal-repo*) echo "arn:aws:ecr:us-east-1:111122223333:repository/fractal-repo" ;;
        *)              echo "arn:aws:ecr:us-east-1:111122223333:repository/customer-repo" ;;
      esac
    else
      echo "fractal-repo	customer-repo"
    fi ;;
  "ecr list-tags-for-resource")
    case "$ARGS" in
      *fractal-repo*) echo '[{"Key":"managed-by","Value":"Fractal Cloud"}]' ;;
      *)              echo '[]' ;;
    esac ;;

  "secretsmanager list-secrets")
    echo '{"SecretList":[
      {"Name":"fractal-secret","Tags":[{"Key":"managed-by","Value":"Fractal Cloud"}]},
      {"Name":"customer-secret","Tags":[{"Key":"owner","Value":"payments"}]},
      {"Name":"rds!cluster-abc","Tags":[{"Key":"managed-by","Value":"Fractal Cloud"}]}]}' ;;

  "resource-groups list-groups") echo "rg-fractal	customer-rg" ;;
  "resource-groups get-tags")
    case "$ARGS" in
      *rg-fractal*) echo '[{"Key":"managed-by","Value":"Fractal Cloud"}]' ;;
      *)            echo '[]' ;;
    esac ;;

  "iam list-roles") echo "" ;;

  *) echo "" ;;
esac
exit 0
STUB
chmod +x "${STUB_BIN}/aws"

run_aws() { # extra flags... -> prints the run output
  (
    export PATH="${STUB_BIN}:${PATH}"
    export AWS_ACCESS_KEY_ID=stub AWS_SECRET_ACCESS_KEY=stub
    unset GITHUB_STEP_SUMMARY GITHUB_WORKSPACE
    "$AWS_SCRIPT" --region us-east-1 --dry-run --yes "$@" 2>&1
  )
}

assert_out() { # <output> <pattern> <description>
  if grep -qE "$2" <<< "$1"; then pass "$3"; else fail "$3"; fi
}
assert_not_out() { # <output> <pattern> <description>
  if grep -qE "$2" <<< "$1"; then fail "$3"; else pass "$3"; fi
}

echo "cleanup-tag-scope.test.sh"

SCOPED="$(run_aws || true)"

# ── Fractal-owned resources are in scope ──────────────────────────────────
assert_out "$SCOPED" "Delete ECS cluster fractal-cluster"        "scoped: deletes the Fractal ECS cluster"
assert_out "$SCOPED" "Delete ECS service fractal-svc"            "scoped: deletes services of the Fractal cluster"
assert_out "$SCOPED" "Delete load balancer fractal-lb"           "scoped: deletes the Fractal load balancer (agent marker value)"
assert_out "$SCOPED" "Delete target group fractal-tg"            "scoped: deletes the Fractal target group"
assert_out "$SCOPED" "Delete log group fractal-cloud-agent"      "scoped: deletes the Fractal log group"
assert_out "$SCOPED" "Delete DB instance fractal-db"             "scoped: deletes the Fractal DB instance"
assert_out "$SCOPED" "Delete DB cluster fractal-cluster-db"      "scoped: deletes the Fractal DB cluster"
assert_out "$SCOPED" "Delete ECR repo fractal-repo"              "scoped: deletes the Fractal ECR repo"
assert_out "$SCOPED" "Delete secret fractal-secret"              "scoped: deletes the Fractal secret"
assert_out "$SCOPED" "Delete transit gateway tgw-fractal"        "scoped: deletes the Fractal transit gateway"
assert_out "$SCOPED" "Delete resource group rg-fractal"          "scoped: deletes the Fractal resource group"
assert_out "$SCOPED" "Release orphaned Elastic IP eipalloc-fractal" "scoped: releases the Fractal Elastic IP"

# ── Customer-owned resources are left alone ───────────────────────────────
assert_not_out "$SCOPED" "customer-cluster"    "scoped: leaves the customer ECS cluster"
assert_not_out "$SCOPED" "customer-svc"        "scoped: never enumerates services of a customer cluster"
assert_not_out "$SCOPED" "customer-lb"         "scoped: leaves the customer load balancer"
assert_not_out "$SCOPED" "customer-tg"         "scoped: leaves the customer target group"
assert_not_out "$SCOPED" "customer-db"         "scoped: leaves the customer DB instance"
assert_not_out "$SCOPED" "customer-cluster-db" "scoped: leaves the customer DB cluster"
assert_not_out "$SCOPED" "customer-repo"       "scoped: leaves the customer ECR repo"
assert_not_out "$SCOPED" "customer-secret"     "scoped: leaves the customer secret"
assert_not_out "$SCOPED" "customer-rg"         "scoped: leaves the customer resource group"
assert_not_out "$SCOPED" "customer-task"       "scoped: leaves task definition families outside fractal-*"
assert_not_out "$SCOPED" "vpc-customer"        "scoped: leaves the customer VPC"
assert_not_out "$SCOPED" "tgw-customer"        "scoped: leaves the customer transit gateway"
assert_not_out "$SCOPED" "eipalloc-customer"   "scoped: leaves the customer Elastic IP"

# RDS-owned secrets are still excluded — they can only be removed with their cluster.
assert_not_out "$SCOPED" "rds!cluster-abc"     "scoped: still excludes rds!-owned secrets"

# The scope has to be visible before anything is deleted.
assert_out "$SCOPED" "Scope:.*managed-by"      "scoped: prints the marker-tag scope in the banner"



# ══════════════════════════════════════════════════════════════════════════
# Azure — resource groups scoped by the managed-by tag
# ══════════════════════════════════════════════════════════════════════════
# env-service writes "Fractal" on Azure, not "Fractal Cloud" as it does on AWS; the agents write
# "fractal-cloud" on both. The stub emulates the server-side JMESPath filter by keying off whether
# the caller pushed the tag predicate into --query.
cat > "${STUB_BIN}/az" <<'AZSTUB'
#!/usr/bin/env bash
set -uo pipefail
ARGS="$*"
case "${1:-} ${2:-}" in
  "account show") echo '{"name":"stub-sub","tenantId":"stub-tenant"}' ;;
  "group list")
    if [[ "$ARGS" == *'managed-by'* ]]; then
      printf 'rg-fractal\nrg-livesystem\n'
    else
      printf 'rg-fractal\nrg-livesystem\nrg-customer\n'
    fi ;;
  *) echo "" ;;
esac
exit 0
AZSTUB
chmod +x "${STUB_BIN}/az"

run_azure() {
  (
    export PATH="${STUB_BIN}:${PATH}"
    unset GITHUB_STEP_SUMMARY GITHUB_WORKSPACE
    "$AZURE_SCRIPT" --subscription stub-sub --dry-run --yes "$@" 2>&1
  )
}

AZ_SCOPED="$(run_azure || true)"
assert_out     "$AZ_SCOPED" "rg-fractal"          "azure scoped: deletes the env-service resource group"
assert_out     "$AZ_SCOPED" "rg-livesystem"       "azure scoped: deletes the LiveSystem resource group"
assert_not_out "$AZ_SCOPED" "rg-customer"         "azure scoped: leaves the customer resource group"
assert_out     "$AZ_SCOPED" "Scope:.*managed-by"  "azure scoped: prints the marker-tag scope in the banner"

# `[?a][?b]` does not compose in JMESPath — the second filter applies to the elements of each
# element, so the result is always empty and the cleanup silently deletes nothing. The tag
# predicate has to stay merged into a single filter.
if grep -vE '^\s*#' "${SCRIPT_DIR}/azure-cleanup-init.sh" | grep -qE '\]\[\?'; then
  fail "azure: uses chained JMESPath filters, which always evaluate to empty"
else
  pass "azure: keeps the tag predicate in a single JMESPath filter"
fi

# ══════════════════════════════════════════════════════════════════════════
# GCP — project-scoped, and has to say so
# ══════════════════════════════════════════════════════════════════════════
cat > "${STUB_BIN}/gcloud" <<'GCSTUB'
#!/usr/bin/env bash
set -uo pipefail
case "${1:-} ${2:-}" in
  "projects describe") echo '{"name":"stub-project","projectNumber":"1234567890"}' ;;
  *) echo "" ;;
esac
exit 0
GCSTUB
chmod +x "${STUB_BIN}/gcloud"

GCP_OUT="$(
  (
    export PATH="${STUB_BIN}:${PATH}"
    unset GITHUB_STEP_SUMMARY GITHUB_WORKSPACE
    "$GCP_SCRIPT" --project stub-project --dry-run --yes 2>&1
  ) || true
)"
assert_out "$GCP_OUT" "Scope:.*whole project" "gcp: states the project-wide scope in the banner"

# The scope is wider than AWS's and Azure's, so the operator has to be told why before being asked
# to confirm, and confirming has to take more than typing 'yes'.
assert_grep_file() { # <file> <pattern> <description>
  if grep -qE "$2" "$1"; then pass "$3"; else fail "$3"; fi
}
assert_grep_file "$GCP_SCRIPT" "SCOPE — read this before"        "gcp: header carries the scope warning"
assert_grep_file "$GCP_SCRIPT" 'CONFIRM" != "\$PROJECT"'         "gcp: confirmation requires typing the project ID"
assert_grep_file "$AWS_SCRIPT" 'CONFIRM" != "\$ACCOUNT_ID"'      "aws: confirmation requires typing the account ID"
assert_grep_file "$AZURE_SCRIPT" 'CONFIRM" != "\$SUBSCRIPTION"'  "azure: confirmation requires typing the subscription ID"

# A cleanup run must not drop a cleanup-reports/ directory into whatever folder it was started from.
for f in "$AWS_SCRIPT" "$AZURE_SCRIPT" "$GCP_SCRIPT"; do
  if grep -qE 'GITHUB_WORKSPACE:-\.' "$f"; then
    fail "$(basename "$f"): still writes its report into the current directory by default"
  else
    pass "$(basename "$f"): only writes a report directory when asked"
  fi
done

# ══════════════════════════════════════════════════════════════════════════
# These are customer-facing scripts, not the internal cost sweep
# ══════════════════════════════════════════════════════════════════════════
# Fractal runs a separate, deliberately unscoped cleanup against its own sandbox accounts to keep
# costs down. That sweep must never reach a customer's account, so none of the scripts here may
# carry a mode that reproduces it, and none may assume it is running inside CI.
for f in "$AWS_SCRIPT" "$AZURE_SCRIPT" "$GCP_SCRIPT"; do
  b="$(basename "$f")"
  if grep -q 'include-untagged' "$f"; then
    fail "${b}: offers a sweep-everything mode"
  else
    pass "${b}: offers no sweep-everything mode"
  fi
  if grep -qE 'GITHUB_(STEP_SUMMARY|WORKSPACE)' "$f"; then
    fail "${b}: still depends on GitHub Actions environment variables"
  else
    pass "${b}: runs standalone, with no CI environment assumptions"
  fi
  # A failed deletion must not be reported behind a zero exit status.
  if grep -q 'FAILED\[@\]} -gt 0' "$f" && grep -q 'exit 1' "$f"; then
    pass "${b}: exits non-zero when a deletion failed"
  else
    fail "${b}: is missing the fail-on-error exit guard"
  fi
done

echo ""
echo "Passed: ${PASS}, Failed: ${FAIL}"
[[ $FAIL -eq 0 ]]
