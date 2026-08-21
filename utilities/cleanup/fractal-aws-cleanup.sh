#!/usr/bin/env bash
#
# Discovers and deletes the Fractal Cloud resources in an AWS account.
# Can target a single region or scan all enabled regions.
# Runs in reverse dependency order to avoid "resource in use" errors.
#
# Deleting an environment in Fractal Cloud stops the management layer and deliberately leaves your
# infrastructure running, so opting out never causes an outage. This script is the separate,
# explicit step that removes that infrastructure — when you are leaving for good, or when a failed
# initialization has to be retried from a clean account.
#
# Scope: only resources carrying the marker tag `managed-by` with the value "Fractal Cloud"
# (written by the environments service during environment initialization) or "fractal-cloud"
# (written by the cloud agents on LiveSystem resources). Anything else in the account is left
# untouched. Two resource classes cannot be matched by tag and are matched by the platform's own
# naming instead: ECS task definition families (`fractal-*`) and IAM roles (`Fractal*`).
#
# Usage:
#   ./fractal-aws-cleanup.sh --profile <aws-profile> [--region <aws-region>] [--dry-run]
#
# Start with --dry-run. It performs the same discovery and prints every deletion it would make
# without calling a single delete API.
#
# Prerequisites:
#   - AWS CLI v2 configured, with credentials for the target account
#   - jq installed
#   - The permissions listed in README.md in this directory
#
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

DRY_RUN=false
REGION=""
PROFILE=""
YES=false
REPORT_DIR=""

# Timeouts
AWS_CMD_TIMEOUT=120          # seconds per AWS CLI command
# Must outlast one region's sequential blocking waits: RDS instance-deleted (<=600s)
# + RDS cluster-deleted (<=600s) + EC2 instance-terminated (<=600s) + TGW attachment
# and per-VPC NAT/ENI/TGW drains, all before VPC teardown (step 10). At 900s a region
# with RDS was killed mid-teardown, orphaning its VPCs and resource groups. 45 minutes
# covers the worst-case chain.
REGION_TIMEOUT=2700          # 45 minutes per region
MAX_PARALLEL_REGIONS=5       # max regions to process concurrently

# Temp directory for parallel result collection (may be overridden by --_results-dir)
RESULTS_DIR=$(mktemp -d)
_OWN_RESULTS_DIR="$RESULTS_DIR"
trap 'rm -rf "$_OWN_RESULTS_DIR"' EXIT


usage() {
  echo "Usage: $0 [--profile <aws-profile>] [--region <aws-region>] [--dry-run] [--yes]"
  echo "                [--report-dir <path>]"
  echo ""
  echo "Options:"
  echo "  --profile    AWS CLI profile name (from ~/.aws/config). Optional if AWS"
  echo "               credentials are provided via environment variables."
  echo "  --region     AWS region (e.g., us-east-2). If omitted, scans all enabled regions."
  echo "  --dry-run    Show what would be deleted without actually deleting"
  echo "  --yes        Skip confirmation prompt (for automation)"
  echo "  --report-dir Directory to write the Markdown run report into. Omit to keep the"
  echo "               report in a temp directory that is removed on exit."
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --region) REGION="$2"; shift 2 ;;
    --profile) PROFILE="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --yes) YES=true; shift ;;
    --report-dir) REPORT_DIR="$2"; shift 2 ;;
    *) usage ;;
  esac
done

if [[ -n "$PROFILE" ]]; then
  export AWS_PROFILE="$PROFILE"
elif [[ -z "${AWS_ACCESS_KEY_ID:-}" && -z "${AWS_ROLE_ARN:-}" ]]; then
  echo -e "${RED}Error: --profile is required when AWS credentials are not set via environment variables.${NC}"
  usage
fi

DELETED=()
NOT_FOUND=()
IN_PROGRESS=()
FAILED=()

# Wrapper for AWS CLI commands with timeout and retry
aws_with_timeout() {
  timeout "$AWS_CMD_TIMEOUT" aws "$@"
}

# ──────────────────────────────────────────────────────────────────────
# Tag scoping
#
# Discovery is scoped to the `managed-by` marker tag that every Fractal-created resource carries.
# The tag is always applied at create time (TagSpecifications / create-time `Tags`), never in a
# follow-up call, so there is no create-then-tag window that a scoped sweep could miss.
#
# Two marker values are in play, because two systems provision into the same account:
#   "Fractal Cloud" — the environments service, during environment initialization
#   "fractal-cloud" — the cloud agents, on LiveSystem resources
# Both are matched. An account being handed back to its owner should keep neither, and matching one
# value only would silently leave the other system's resources behind.
#
# There is no unscoped mode. Anything in the account without a marker tag stays, which is the whole
# point of running this against an account you also use for your own work.
# ──────────────────────────────────────────────────────────────────────
TAG_KEY="managed-by"
TAG_VALUE_ENV="Fractal Cloud"
TAG_VALUE_AGENT="fractal-cloud"
# Filter argument for the EC2-family describe calls, which match tags server-side.
EC2_TAG_FILTER="Name=tag:${TAG_KEY},Values=${TAG_VALUE_ENV},${TAG_VALUE_AGENT}"
# IAM roles are the one resource class matched by name rather than by tag: iam:ListRoles does not
# return tags, and reading them back one role at a time does not scale in a populated account.
IAM_ROLE_PREFIX="Fractal"

# True when a tag collection carries either marker value. Accepts the three shapes the AWS CLI
# returns tags in: [{Key,Value}] (EC2, ELB, RDS, ECR, Secrets Manager), [{key,value}] (ECS), and
# {key: value} (CloudWatch Logs).
has_marker_tag() {
  local tags_json="$1"
  [[ -z "$tags_json" || "$tags_json" == "null" ]] && return 1
  jq -e --arg k "$TAG_KEY" --arg v1 "$TAG_VALUE_ENV" --arg v2 "$TAG_VALUE_AGENT" '
    if type == "object" then
      (.[$k] == $v1 or .[$k] == $v2)
    elif type == "array" then
      any(.[]; ((.Key // .key) == $k) and (((.Value // .value) == $v1) or ((.Value // .value) == $v2)))
    else
      false
    end' <<< "$tags_json" >/dev/null 2>&1
}

# Selects an ARN/identifier list down to the entries carrying a marker tag. The tag read differs per
# service, so the caller passes the command that returns one entry's tags as a JSON document.
# Usage: filter_by_tag <read-tags-command> <identifier>...
#   The command is invoked as `<cmd> <identifier>` and must print the tag JSON on stdout.
filter_by_tag() {
  local read_tags="$1"; shift
  local id tags kept=()
  for id in "$@"; do
    [[ -z "$id" ]] && continue
    tags=$($read_tags "$id" 2>/dev/null || echo null)
    if has_marker_tag "$tags"; then
      kept+=("$id")
    fi
  done
  echo "${kept[@]+"${kept[@]}"}"
}

# Per-service tag readers. Each takes one identifier and prints its tags as JSON.
# TAG_READ_REGION is set by cleanup_region before use — these run inside a per-region subshell.
read_tags_ecs_cluster() {
  aws_with_timeout ecs describe-clusters --region "$TAG_READ_REGION" --clusters "$1" --include TAGS \
    --query "clusters[0].tags" --output json
}

read_tags_elbv2() {
  aws_with_timeout elbv2 describe-tags --region "$TAG_READ_REGION" --resource-arns "$1" \
    --query "TagDescriptions[0].Tags" --output json
}

read_tags_ecr_repo() {
  local arn
  arn=$(aws_with_timeout ecr describe-repositories --region "$TAG_READ_REGION" --repository-names "$1" \
    --query "repositories[0].repositoryArn" --output text) || return 1
  aws_with_timeout ecr list-tags-for-resource --region "$TAG_READ_REGION" --resource-arn "$arn" \
    --query "tags" --output json
}

read_tags_resource_group() {
  aws_with_timeout resource-groups get-tags --region "$TAG_READ_REGION" \
    --arn "arn:aws:resource-groups:${TAG_READ_REGION}:${ACCOUNT_ID}:group/${1}" \
    --query "Tags" --output json
}

read_tags_log_group() {
  aws_with_timeout logs list-tags-log-group --region "$TAG_READ_REGION" --log-group-name "$1" \
    --query "tags" --output json
}

# Marker-tagged CloudWatch log groups. describe-log-groups returns no tags and reading them back for
# every group in a populated account is prohibitive, so ask the Resource Groups Tagging API — one
# call answers the whole question. When those credentials lack tag:GetResources the call yields
# nothing and the fallback reads tags for the groups whose name carries the platform's marker.
discover_log_groups() {
  local R="$1"
  local arns
  arns=$(aws_with_timeout resourcegroupstaggingapi get-resources --region "$R" \
    --resource-type-filters logs:log-group \
    --tag-filters "Key=${TAG_KEY},Values=${TAG_VALUE_ENV},${TAG_VALUE_AGENT}" \
    --query "ResourceTagMappingList[].ResourceARN" --output text 2>/dev/null || true)
  if [[ -n "${arns// }" ]]; then
    # arn:aws:logs:<region>:<account>:log-group:<name>[:*]
    echo "$arns" | tr '\t' '\n' | sed -E 's/^.*:log-group:([^:]*).*$/\1/' | tr '\n' ' '
    return
  fi
  local candidates
  candidates=$(aws_with_timeout logs describe-log-groups --region "$R" \
    --query "logGroups[?contains(logGroupName, 'fractal')].logGroupName" --output text 2>/dev/null || true)
  # shellcheck disable=SC2086
  filter_by_tag read_tags_log_group $candidates
}

# Marker-tagged rows out of a describe response that already embeds tags.
# Usage: jq_select_marked <json> <array-path> <tags-path> <id-path>
jq_select_marked() {
  jq -r --arg k "$TAG_KEY" --arg v1 "$TAG_VALUE_ENV" --arg v2 "$TAG_VALUE_AGENT" "$2"'[]?
    | select(any('"$3"'[]?; .Key == $k and (.Value == $v1 or .Value == $v2)))
    | '"$4" <<< "$1" 2>/dev/null | tr '\n' ' '
}

run() {
  local desc="$1"; shift
  local result_file="${RESULT_FILE:-}"
  if $DRY_RUN; then
    echo -e "  ${CYAN}[DRY-RUN]${NC} $desc"
    return
  fi
  echo -e "  ${GREEN}[RUN]${NC} $desc"
  local output
  local retries=2
  local attempt=0
  local success=false
  while [[ $attempt -lt $retries ]]; do
    attempt=$((attempt + 1))
    local exit_code=0
    output=$(timeout "$AWS_CMD_TIMEOUT" bash -c "$*" 2>&1) || exit_code=$?
    if [[ $exit_code -eq 0 ]]; then
      success=true
      break
    fi
    # Check if it was a timeout (exit code 124 from timeout command)
    if [[ $exit_code -eq 124 ]]; then
      echo -e "  ${YELLOW}[TIMEOUT]${NC} $desc (attempt $attempt/$retries)"
      if [[ $attempt -lt $retries ]]; then
        echo -e "  ${CYAN}[RETRY]${NC} Retrying $desc..."
        sleep 5
        continue
      fi
      output="Error: Command timed out after ${AWS_CMD_TIMEOUT}s (${retries} attempts)"
    fi
    # Check error type — don't retry known permanent errors
    if echo "$output" | grep -qiE "already being deleted|already being created|is being modified|is being deleted|InvalidDBInstanceState|InvalidDBClusterState|InvalidClusterState"; then
      echo -e "  ${CYAN}[IN PROGRESS]${NC} $desc — already being deleted"
      if [[ -n "$result_file" ]]; then
        echo "IN_PROGRESS|$desc" >> "$result_file"
      else
        IN_PROGRESS+=("$desc")
      fi
      return
    elif echo "$output" | grep -qiE "not found|does not exist|no such|NotFoundException|NoSuchEntity|DBInstanceNotFound|DBClusterNotFound|ResourceNotFoundException|ClusterNotFoundException|ServiceNotActiveException|ServiceNotFoundException|InvalidParameterException"; then
      echo -e "  ${YELLOW}[NOT FOUND]${NC} $desc"
      if [[ -n "$result_file" ]]; then
        echo "NOT_FOUND|$desc" >> "$result_file"
      else
        NOT_FOUND+=("$desc")
      fi
      return
    fi
    # Transient error — retry
    if [[ $attempt -lt $retries ]]; then
      echo -e "  ${YELLOW}[ERROR]${NC} $desc (attempt $attempt/$retries) — retrying in 5s..."
      sleep 5
    fi
  done

  if $success; then
    if [[ -n "$result_file" ]]; then
      echo "DELETED|$desc" >> "$result_file"
    else
      DELETED+=("$desc")
    fi
  else
    echo -e "  ${RED}[FAILED]${NC} $desc"
    echo "    $output"
    if [[ -n "$result_file" ]]; then
      echo "FAILED|$desc: $output" >> "$result_file"
    else
      FAILED+=("$desc: $output")
    fi
  fi
}

# ──────────────────────────────────────────────────────────────────────
# Preflight — fail fast if the credentials lack a permission the teardown relies on.
# Per-resource discovery below swallows stderr (`2>/dev/null || true`), so an IAM gap is otherwise
# invisible: the denied describe/delete silently no-ops and the failure only resurfaces steps later
# as a cryptic DependencyViolation (observed 2026-07-02 — the cleanup role was missing the
# VPC-endpoint/ENI permissions, leaving endpoint ENIs that blocked subnet/VPC deletion across 7
# accounts). Each canary read lives in the same IAM statement as its matching delete action, so a
# denial here means that whole statement is absent from the role.
# ──────────────────────────────────────────────────────────────────────
preflight_check() {
  local region="$1"
  local denied=()
  local check label args out
  # "label|aws args" — one representative read per critical permission group.
  local checks=(
    "ec2:DescribeVpcEndpoints|ec2 describe-vpc-endpoints --max-items 1"
    "ec2:DescribeNetworkInterfaces|ec2 describe-network-interfaces --max-items 1"
    "ec2:DescribeInstances|ec2 describe-instances --max-items 1"
    "ec2:DescribeVpcPeeringConnections|ec2 describe-vpc-peering-connections --max-items 1"
    "ec2:DescribeSecurityGroupRules|ec2 describe-security-group-rules --max-items 1"
    "ec2:DescribeVpcs|ec2 describe-vpcs --max-items 1"
  )
  echo -e "${CYAN}Preflight: checking required permissions...${NC}"
  for check in "${checks[@]}"; do
    label="${check%%|*}"
    args="${check#*|}"
    # shellcheck disable=SC2086
    out=$(timeout "$AWS_CMD_TIMEOUT" aws $args --region "$region" 2>&1) || true
    if echo "$out" | grep -qiE "UnauthorizedOperation|AccessDenied|is not authorized to perform|not authorized"; then
      denied+=("$label")
    fi
  done
  if [[ ${#denied[@]} -gt 0 ]]; then
    echo -e "${RED}Preflight failed — the cleanup credentials are missing required permissions:${NC}"
    for d in "${denied[@]}"; do echo -e "  ${RED}✗${NC} $d"; done
    echo -e "${YELLOW}Grant them (see README.md in this directory), then re-run. Aborting before any"
    echo -e "deletion to avoid a silent partial teardown (leftover ENIs → DependencyViolation).${NC}"
    exit 1
  fi
  echo -e "  ${GREEN}Preflight OK${NC} — required EC2 read permissions present."
  # tag:GetResources is not required — log-group discovery falls back to reading tags for the groups
  # whose name carries the platform marker — but without it that fallback misses a tagged group
  # named after a customer workload, so say so rather than silently under-deleting.
  out=$(timeout "$AWS_CMD_TIMEOUT" aws resourcegroupstaggingapi get-resources --region "$region" \
    --resource-type-filters logs:log-group --max-items 1 2>&1) || true
  if echo "$out" | grep -qiE "UnauthorizedOperation|AccessDenied|is not authorized to perform|not authorized"; then
    echo -e "  ${YELLOW}Note${NC} — tag:GetResources is denied. Log groups will be discovered by name"
    echo -e "  instead of by tag; a tagged log group without 'fractal' in its name will be left behind."
  fi
  echo ""
}

# ──────────────────────────────────────────────────────────────────────
# Clean up all resources in a single region
# ──────────────────────────────────────────────────────────────────────
cleanup_region() {
  local R="$1"

  # Tag readers below run against this region.
  TAG_READ_REGION="$R"

  echo -e "${CYAN}Discovering resources in ${R}...${NC}"

  # ECS
  local ECS_CLUSTERS
  ECS_CLUSTERS=$(aws_with_timeout ecs list-clusters --region "$R" --query "clusterArns[]" --output text 2>/dev/null || true)
  # shellcheck disable=SC2086
  ECS_CLUSTERS=$(filter_by_tag read_tags_ecs_cluster $ECS_CLUSTERS)

  # Load Balancers
  local LB_ARNS
  LB_ARNS=$(aws_with_timeout elbv2 describe-load-balancers --region "$R" --query "LoadBalancers[].LoadBalancerArn" --output text 2>/dev/null || true)
  local TG_ARNS
  TG_ARNS=$(aws_with_timeout elbv2 describe-target-groups --region "$R" --query "TargetGroups[].TargetGroupArn" --output text 2>/dev/null || true)
  # shellcheck disable=SC2086
  LB_ARNS=$(filter_by_tag read_tags_elbv2 $LB_ARNS)
  # shellcheck disable=SC2086
  TG_ARNS=$(filter_by_tag read_tags_elbv2 $TG_ARNS)

  # CloudWatch Log Groups
  # The platform's log groups are named `fractal-cloud-agent`, `fractal-caas-k8s-agent`, ... (see
  # AwsConstants.Fractal*LogGroupName) — not `/aws/ecs/fractal`, which an earlier prefix filter
  # looked for and which therefore never matched a single group. Discovery is by tag now.
  local LOG_GROUPS
  LOG_GROUPS=$(discover_log_groups "$R")

  # RDS — describe-db-instances / describe-db-clusters embed TagList, so one call carries both the
  # identifiers and the tags needed to scope them.
  local DB_INSTANCES DB_CLUSTERS DB_SUBNET_GROUPS
  local RDS_JSON
  RDS_JSON=$(aws_with_timeout rds describe-db-instances --region "$R" --output json 2>/dev/null || echo '{}')
  DB_INSTANCES=$(jq_select_marked "$RDS_JSON" ".DBInstances" ".TagList" ".DBInstanceIdentifier")
  RDS_JSON=$(aws_with_timeout rds describe-db-clusters --region "$R" --output json 2>/dev/null || echo '{}')
  DB_CLUSTERS=$(jq_select_marked "$RDS_JSON" ".DBClusters" ".TagList" ".DBClusterIdentifier")
  # DB subnet groups created by env-service are named `db-subnet-psql-fractal-<env>` (see
  # AwsAuroraPostgresInitializer.EnsureDbSubnetGroupExistsAsync). describe-db-subnet-groups returns
  # no tags, so this one stays matched by its platform-owned name prefix. The earlier filter started
  # with `psql-fractal` which never matched, so these survived every run and would block re-init the
  # next day with "AZ coverage: <empty>" once their subnets were gone.
  DB_SUBNET_GROUPS=$(aws_with_timeout rds describe-db-subnet-groups --region "$R" --query "DBSubnetGroups[?starts_with(DBSubnetGroupName, 'db-subnet-psql-fractal')].DBSubnetGroupName" --output text 2>/dev/null || true)

  # ECR
  local ECR_REPOS
  ECR_REPOS=$(aws_with_timeout ecr describe-repositories --region "$R" --query "repositories[].repositoryName" --output text 2>/dev/null || true)
  # shellcheck disable=SC2086
  ECR_REPOS=$(filter_by_tag read_tags_ecr_repo $ECR_REPOS)

  # Secrets Manager
  # RDS-owned secrets (name prefix `rds!`, e.g. `rds!cluster-...`) are managed by RDS and cannot be
  # deleted directly — `DeleteSecret` returns `InvalidRequestException: Operation is not allowed on
  # secret owned by rds`. They are removed automatically when their RDS cluster/instance is deleted
  # (handled in step 6), so exclude them from discovery to avoid perpetual false failures.
  local SECRETS
  local SECRETS_JSON
  SECRETS_JSON=$(aws_with_timeout secretsmanager list-secrets --region "$R" --output json 2>/dev/null || echo '{}')
  SECRETS=$(jq -r --arg k "$TAG_KEY" --arg v1 "$TAG_VALUE_ENV" --arg v2 "$TAG_VALUE_AGENT" '
    .SecretList[]?
    | select((.Name | startswith("rds!")) | not)
    | select(any(.Tags[]?; .Key == $k and (.Value == $v1 or .Value == $v2)))
    | .Name' <<< "$SECRETS_JSON" 2>/dev/null | tr '\n' ' ')

  # Transit Gateways
  local TGWS
  TGWS=$(aws_with_timeout ec2 describe-transit-gateways --region "$R" \
    --filters "Name=state,Values=available" "$EC2_TAG_FILTER" \
    --query "TransitGateways[].TransitGatewayId" --output text 2>/dev/null || true)

  # VPCs (non-default)
  local VPC_IDS
  VPC_IDS=$(aws_with_timeout ec2 describe-vpcs --region "$R" \
    --filters "Name=isDefault,Values=false" "$EC2_TAG_FILTER" \
    --query "Vpcs[].VpcId" --output text 2>/dev/null || true)

  # Resource Groups
  local RESOURCE_GROUPS
  RESOURCE_GROUPS=$(aws_with_timeout resource-groups list-groups --region "$R" --query "GroupIdentifiers[].GroupName" --output text 2>/dev/null || true)
  # shellcheck disable=SC2086
  RESOURCE_GROUPS=$(filter_by_tag read_tags_resource_group $RESOURCE_GROUPS)

  # Check if there's anything to do
  local HAS_RESOURCES=false
  for VAR in "$ECS_CLUSTERS" "$LB_ARNS" "$TG_ARNS" "$LOG_GROUPS" "$DB_INSTANCES" "$DB_CLUSTERS" \
             "$ECR_REPOS" "$SECRETS" "$TGWS" "$VPC_IDS" "$RESOURCE_GROUPS"; do
    if [[ -n "$VAR" ]]; then
      HAS_RESOURCES=true
      break
    fi
  done

  if ! $HAS_RESOURCES; then
    echo -e "  ${YELLOW}No resources found in ${R}, skipping.${NC}"
    echo ""
    return
  fi

  local COUNT=0
  for VAR in $ECS_CLUSTERS $LB_ARNS $TG_ARNS $LOG_GROUPS $DB_INSTANCES $DB_CLUSTERS \
             $ECR_REPOS $SECRETS $TGWS $VPC_IDS $RESOURCE_GROUPS; do
    COUNT=$((COUNT + 1))
  done
  echo -e "  Found ${CYAN}${COUNT}${NC} resource(s)"

  # 1. ECS Services
  for CLUSTER_ARN in $ECS_CLUSTERS; do
    local CLUSTER_NAME
    CLUSTER_NAME=$(echo "$CLUSTER_ARN" | awk -F/ '{print $NF}')
    local SVC_ARNS
    SVC_ARNS=$(aws_with_timeout ecs list-services --region "$R" --cluster "$CLUSTER_ARN" --query "serviceArns[]" --output text 2>/dev/null || true)
    for SVC_ARN in $SVC_ARNS; do
      local SVC_NAME
      SVC_NAME=$(echo "$SVC_ARN" | awk -F/ '{print $NF}')
      run "[$R] Scale down ECS service $SVC_NAME" "aws ecs update-service --region $R --cluster $CLUSTER_ARN --service $SVC_ARN --desired-count 0 --no-cli-pager"
      run "[$R] Delete ECS service $SVC_NAME" "aws ecs delete-service --region $R --cluster $CLUSTER_ARN --service $SVC_ARN --force --no-cli-pager"
    done
  done

  # 2. ECS Task Definitions
  # RegisterTaskDefinition is called without Tags (AwsElasticContainerServiceService.RegisterTaskDefinition),
  # so task definitions carry no marker tag and cannot be scoped the way everything else is. Every
  # family the platform registers is named `fractal-*` (AwsConstants.Fractal*ElasticContainerServiceTaskFamilyName),
  # so scope them by family prefix instead — list-task-definition-families matches on prefix.
  local TASK_ARNS
  TASK_ARNS=""
  local TASK_FAMILY
  for TASK_FAMILY in $(aws_with_timeout ecs list-task-definition-families --region "$R" \
      --family-prefix fractal --query "families[]" --output text 2>/dev/null || true); do
    TASK_ARNS+=" $(aws_with_timeout ecs list-task-definitions --region "$R" --family-prefix "$TASK_FAMILY" \
      --query "taskDefinitionArns[]" --output text 2>/dev/null || true)"
  done
  for ARN in $TASK_ARNS; do
    local FAMILY
    FAMILY=$(echo "$ARN" | awk -F/ '{print $NF}')
    run "[$R] Deregister task definition $FAMILY" "aws ecs deregister-task-definition --region $R --task-definition $ARN --no-cli-pager"
  done

  # 3. Load Balancers
  for LB_ARN in $LB_ARNS; do
    local LB_NAME
    LB_NAME=$(aws_with_timeout elbv2 describe-load-balancers --region "$R" --load-balancer-arns "$LB_ARN" --query "LoadBalancers[0].LoadBalancerName" --output text 2>/dev/null || echo "$LB_ARN")
    local LISTENER_ARNS
    LISTENER_ARNS=$(aws_with_timeout elbv2 describe-listeners --region "$R" --load-balancer-arn "$LB_ARN" --query "Listeners[].ListenerArn" --output text 2>/dev/null || true)
    for LARN in $LISTENER_ARNS; do
      run "[$R] Delete listener on $LB_NAME" "aws elbv2 delete-listener --region $R --listener-arn $LARN --no-cli-pager"
    done
    run "[$R] Delete load balancer $LB_NAME" "aws elbv2 delete-load-balancer --region $R --load-balancer-arn $LB_ARN --no-cli-pager"
  done
  if ! $DRY_RUN && [[ -n "$LB_ARNS" ]]; then
    echo "  Waiting for load balancers to be deleted..."
    for LB_ARN in $LB_ARNS; do
      timeout 300 aws elbv2 wait load-balancers-deleted --region "$R" --load-balancer-arns "$LB_ARN" 2>/dev/null || true
    done
  fi
  for TG_ARN in $TG_ARNS; do
    local TG_NAME
    TG_NAME=$(aws_with_timeout elbv2 describe-target-groups --region "$R" --target-group-arns "$TG_ARN" --query "TargetGroups[0].TargetGroupName" --output text 2>/dev/null || echo "$TG_ARN")
    run "[$R] Delete target group $TG_NAME" "aws elbv2 delete-target-group --region $R --target-group-arn $TG_ARN --no-cli-pager"
  done

  # 4. CloudWatch Log Groups
  for LG in $LOG_GROUPS; do
    run "[$R] Delete log group $LG" "aws logs delete-log-group --region $R --log-group-name $LG"
  done

  # 5. ECS Clusters
  for CLUSTER_ARN in $ECS_CLUSTERS; do
    local CLUSTER_NAME
    CLUSTER_NAME=$(echo "$CLUSTER_ARN" | awk -F/ '{print $NF}')
    run "[$R] Delete ECS cluster $CLUSTER_NAME" "aws ecs delete-cluster --region $R --cluster $CLUSTER_ARN --no-cli-pager"
  done

  # 6. RDS
  for INSTANCE in $DB_INSTANCES; do
    run "[$R] Delete DB instance $INSTANCE" "aws rds delete-db-instance --region $R --db-instance-identifier $INSTANCE --skip-final-snapshot --no-cli-pager"
  done
  if ! $DRY_RUN && [[ -n "$DB_INSTANCES" ]]; then
    for INSTANCE in $DB_INSTANCES; do
      echo "  Waiting for DB instance $INSTANCE..."
      timeout 600 aws rds wait db-instance-deleted --region "$R" --db-instance-identifier "$INSTANCE" 2>/dev/null || true
    done
  fi
  for CLUSTER in $DB_CLUSTERS; do
    run "[$R] Delete DB cluster $CLUSTER" "aws rds delete-db-cluster --region $R --db-cluster-identifier $CLUSTER --skip-final-snapshot --no-cli-pager"
  done
  if ! $DRY_RUN && [[ -n "$DB_CLUSTERS" ]]; then
    for CLUSTER in $DB_CLUSTERS; do
      echo "  Waiting for DB cluster $CLUSTER..."
      timeout 600 aws rds wait db-cluster-deleted --region "$R" --db-cluster-identifier "$CLUSTER" 2>/dev/null || true
    done
  fi
  for SG in $DB_SUBNET_GROUPS; do
    run "[$R] Delete DB subnet group $SG" "aws rds delete-db-subnet-group --region $R --db-subnet-group-name $SG"
  done

  # 7. ECR
  for REPO in $ECR_REPOS; do
    run "[$R] Delete ECR repo $REPO" "aws ecr delete-repository --region $R --repository-name $REPO --force --no-cli-pager"
  done

  # 8. Secrets Manager
  for SECRET in $SECRETS; do
    run "[$R] Delete secret $SECRET" "aws secretsmanager delete-secret --region $R --secret-id $SECRET --force-delete-without-recovery --no-cli-pager"
  done

  # 9. Transit Gateways
  for TGW_ID in $TGWS; do
    # 9a. Delete all attachments (VPC, peering, connect, etc.)
    local ATTACH_IDS
    ATTACH_IDS=$(aws_with_timeout ec2 describe-transit-gateway-attachments --region "$R" \
      --filters "Name=transit-gateway-id,Values=${TGW_ID}" "Name=state,Values=available,associating,associated" \
      --query "TransitGatewayAttachments[].[TransitGatewayAttachmentId,ResourceType]" --output text 2>/dev/null || true)
    while IFS=$'\t' read -r AID ATYPE; do
      [[ -z "$AID" ]] && continue
      case "$ATYPE" in
        vpc) run "[$R] Delete TGW VPC attachment $AID" "aws ec2 delete-transit-gateway-vpc-attachment --region $R --transit-gateway-attachment-id $AID --no-cli-pager" ;;
        peering) run "[$R] Delete TGW peering attachment $AID" "aws ec2 delete-transit-gateway-peering-attachment --region $R --transit-gateway-attachment-id $AID --no-cli-pager" ;;
        connect) run "[$R] Delete TGW connect attachment $AID" "aws ec2 delete-transit-gateway-connect --region $R --transit-gateway-connect-id $AID --no-cli-pager" ;;
        *) run "[$R] Delete TGW attachment $AID ($ATYPE)" "aws ec2 delete-transit-gateway-vpc-attachment --region $R --transit-gateway-attachment-id $AID --no-cli-pager" ;;
      esac
    done <<< "$ATTACH_IDS"

    # 9b. Wait for all attachments to be fully deleted
    if ! $DRY_RUN && [[ -n "$ATTACH_IDS" ]]; then
      echo "  Waiting for TGW attachments to be deleted..."
      local WAIT_ATTEMPTS=0
      while [[ $WAIT_ATTEMPTS -lt 40 ]]; do
        local REMAINING
        REMAINING=$(aws_with_timeout ec2 describe-transit-gateway-attachments --region "$R" \
          --filters "Name=transit-gateway-id,Values=${TGW_ID}" \
          --query "TransitGatewayAttachments[?State!='deleted'].TransitGatewayAttachmentId" --output text 2>/dev/null || true)
        [[ -z "$REMAINING" ]] && break
        WAIT_ATTEMPTS=$((WAIT_ATTEMPTS + 1))
        sleep 15
      done
    fi

    # 9c. Disassociate and delete non-default route tables
    local RT_IDS
    RT_IDS=$(aws_with_timeout ec2 describe-transit-gateway-route-tables --region "$R" \
      --filters "Name=transit-gateway-id,Values=${TGW_ID}" "Name=default-association-route-table,Values=false" \
      --query "TransitGatewayRouteTables[].TransitGatewayRouteTableId" --output text 2>/dev/null || true)
    for RTID in $RT_IDS; do
      local ASSOC_IDS
      ASSOC_IDS=$(aws_with_timeout ec2 get-transit-gateway-route-table-associations --region "$R" \
        --transit-gateway-route-table-id "$RTID" \
        --query "Associations[].TransitGatewayAttachmentId" --output text 2>/dev/null || true)
      for ASSOC_AID in $ASSOC_IDS; do
        [[ -z "$ASSOC_AID" ]] && continue
        run "[$R] Disassociate TGW route table $RTID from $ASSOC_AID" \
          "aws ec2 disassociate-transit-gateway-route-table --region $R --transit-gateway-route-table-id $RTID --transit-gateway-attachment-id $ASSOC_AID --no-cli-pager"
      done
      run "[$R] Delete TGW route table $RTID" "aws ec2 delete-transit-gateway-route-table --region $R --transit-gateway-route-table-id $RTID --no-cli-pager"
    done

    run "[$R] Delete transit gateway $TGW_ID" "aws ec2 delete-transit-gateway --region $R --transit-gateway-id $TGW_ID --no-cli-pager"
  done

  # 9.5. EC2 instances (terminate before VPC teardown so their ENIs release;
  #      a running instance's ENI blocks subnet/SG/VPC deletion and hangs the region to timeout).
  for VPC_ID in $VPC_IDS; do
    local INSTANCE_IDS
    INSTANCE_IDS=$(aws_with_timeout ec2 describe-instances --region "$R" \
      --filters "Name=vpc-id,Values=${VPC_ID}" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
      --query "Reservations[].Instances[].InstanceId" --output text 2>/dev/null || true)
    [[ -z "$INSTANCE_IDS" ]] && continue
    for IID in $INSTANCE_IDS; do
      run "[$R] Terminate EC2 instance $IID ($VPC_ID)" "aws ec2 terminate-instances --region $R --instance-ids $IID --no-cli-pager"
    done
    if ! $DRY_RUN; then
      echo "  Waiting for EC2 instances to terminate ($VPC_ID)..."
      # shellcheck disable=SC2086
      timeout 600 aws ec2 wait instance-terminated --region "$R" --instance-ids $INSTANCE_IDS 2>/dev/null || true
    fi
  done

  # 10. VPCs (non-default)
  for VPC_ID in $VPC_IDS; do
    local VPC_NAME
    VPC_NAME=$(aws_with_timeout ec2 describe-vpcs --region "$R" --vpc-ids "$VPC_ID" \
      --query "Vpcs[0].Tags[?Key=='Name']|[0].Value" --output text 2>/dev/null || echo "$VPC_ID")
    echo "  Cleaning VPC $VPC_NAME ($VPC_ID)..."

    # 10.0a Transit Gateway VPC attachments for THIS VPC. The account-level TGW sweep (step 9) only
    #       sees TGWs owned by this account; a VPC attached to a shared/cross-account TGW keeps its
    #       attachment ENIs, which block subnet/VPC deletion with DependencyViolation. Delete by
    #       vpc-id and wait for the attachment (and its ENIs) to drain.
    local VPC_TGW_ATTACH
    VPC_TGW_ATTACH=$(aws_with_timeout ec2 describe-transit-gateway-vpc-attachments --region "$R" \
      --filters "Name=vpc-id,Values=${VPC_ID}" "Name=state,Values=available,pending,modifying,failed" \
      --query "TransitGatewayVpcAttachments[].TransitGatewayAttachmentId" --output text 2>/dev/null || true)
    for AID in $VPC_TGW_ATTACH; do
      run "[$R] Delete TGW VPC attachment $AID ($VPC_NAME)" "aws ec2 delete-transit-gateway-vpc-attachment --region $R --transit-gateway-attachment-id $AID --no-cli-pager"
    done
    if ! $DRY_RUN && [[ -n "$VPC_TGW_ATTACH" ]]; then
      echo "  Waiting for TGW VPC attachments to delete ($VPC_NAME)..."
      local TGW_WAIT=0
      while [[ $TGW_WAIT -lt 40 ]]; do
        local TGW_REMAIN
        TGW_REMAIN=$(aws_with_timeout ec2 describe-transit-gateway-vpc-attachments --region "$R" \
          --filters "Name=vpc-id,Values=${VPC_ID}" \
          --query "TransitGatewayVpcAttachments[?State!='deleted'].TransitGatewayAttachmentId" --output text 2>/dev/null || true)
        [[ -z "$TGW_REMAIN" ]] && break
        TGW_WAIT=$((TGW_WAIT + 1))
        sleep 15
      done
    fi

    # 10.0b VPC peering connections (this VPC as requester or accepter). A live peering blocks the
    #       VPC deletion; its route-table entries also block route-table deletion.
    local PCX_IDS
    PCX_IDS=$(aws_with_timeout ec2 describe-vpc-peering-connections --region "$R" \
      --filters "Name=requester-vpc-info.vpc-id,Values=${VPC_ID}" \
      --query "VpcPeeringConnections[?Status.Code!='deleted' && Status.Code!='deleting'].VpcPeeringConnectionId" --output text 2>/dev/null || true)
    PCX_IDS="${PCX_IDS} $(aws_with_timeout ec2 describe-vpc-peering-connections --region "$R" \
      --filters "Name=accepter-vpc-info.vpc-id,Values=${VPC_ID}" \
      --query "VpcPeeringConnections[?Status.Code!='deleted' && Status.Code!='deleting'].VpcPeeringConnectionId" --output text 2>/dev/null || true)"
    for PCX in $PCX_IDS; do
      [[ -z "$PCX" ]] && continue
      run "[$R] Delete VPC peering connection $PCX ($VPC_NAME)" "aws ec2 delete-vpc-peering-connection --region $R --vpc-peering-connection-id $PCX --no-cli-pager"
    done

    # 10a. NAT Gateways
    local NAT_IDS
    NAT_IDS=$(aws_with_timeout ec2 describe-nat-gateways --region "$R" \
      --filter "Name=vpc-id,Values=${VPC_ID}" "Name=state,Values=available,pending" \
      --query "NatGateways[].NatGatewayId" --output text 2>/dev/null || true)
    for NID in $NAT_IDS; do
      run "[$R] Delete NAT gateway $NID ($VPC_NAME)" "aws ec2 delete-nat-gateway --region $R --nat-gateway-id $NID --no-cli-pager"
    done
    if ! $DRY_RUN && [[ -n "$NAT_IDS" ]]; then
      echo "  Waiting for NAT gateways to delete..."
      local NAT_WAIT=0
      while [[ $NAT_WAIT -lt 20 ]]; do
        local NAT_REMAINING
        NAT_REMAINING=$(aws_with_timeout ec2 describe-nat-gateways --region "$R" \
          --filter "Name=vpc-id,Values=${VPC_ID}" "Name=state,Values=available,pending,deleting" \
          --query "NatGateways[?State!='deleted'].NatGatewayId" --output text 2>/dev/null || true)
        [[ -z "$NAT_REMAINING" ]] && break
        NAT_WAIT=$((NAT_WAIT + 1))
        sleep 10
      done
    fi

    # 10b. Elastic IPs — disassociate and release EIPs attached to this VPC's ENIs
    local VPC_ENI_IDS
    VPC_ENI_IDS=$(aws_with_timeout ec2 describe-network-interfaces --region "$R" \
      --filters "Name=vpc-id,Values=${VPC_ID}" \
      --query "NetworkInterfaces[].NetworkInterfaceId" --output text 2>/dev/null || true)
    if [[ -n "$VPC_ENI_IDS" ]]; then
      local EIP_DATA
      EIP_DATA=$(aws_with_timeout ec2 describe-addresses --region "$R" \
        --filters "Name=domain,Values=vpc" \
        --query "Addresses[].[AllocationId,AssociationId,NetworkInterfaceId]" --output text 2>/dev/null || true)
      while IFS=$'\t' read -r ALLOC_ID ASSOC_ID ENI_ID; do
        [[ -z "$ALLOC_ID" ]] && continue
        # Only release EIPs attached to ENIs in this VPC
        if [[ -n "$ENI_ID" && "$ENI_ID" != "None" ]] && echo "$VPC_ENI_IDS" | grep -qw "$ENI_ID"; then
          if [[ "$ASSOC_ID" != "None" && -n "$ASSOC_ID" ]]; then
            run "[$R] Disassociate EIP $ALLOC_ID ($VPC_NAME)" "aws ec2 disassociate-address --region $R --association-id $ASSOC_ID"
          fi
          run "[$R] Release Elastic IP $ALLOC_ID ($VPC_NAME)" "aws ec2 release-address --region $R --allocation-id $ALLOC_ID"
        fi
      done <<< "$EIP_DATA"
    fi
    # 10c. VPC Endpoints
    local VPCE_IDS
    VPCE_IDS=$(aws_with_timeout ec2 describe-vpc-endpoints --region "$R" \
      --filters "Name=vpc-id,Values=${VPC_ID}" \
      --query "VpcEndpoints[].VpcEndpointId" --output text 2>/dev/null || true)
    if [[ -n "$VPCE_IDS" ]]; then
      run "[$R] Delete VPC endpoints ($VPC_NAME)" "aws ec2 delete-vpc-endpoints --region $R --vpc-endpoint-ids $VPCE_IDS --no-cli-pager"
    fi

    # 10d. Network Interfaces (detach and delete customer-managed ENIs).
    #      Skip requester-managed ENIs (VPC-endpoint / NAT / TGW / Fargate): they cannot be
    #      manually detached (detach-network-interface returns OperationNotPermitted) and are
    #      removed by their owning service once step 10c / NAT / TGW teardown completes. The
    #      10d-wait loop below drains them. Attempting to detach them only produced false
    #      FAILED entries that flipped a fully successful teardown to exit 1.
    local ENI_DATA
    ENI_DATA=$(aws_with_timeout ec2 describe-network-interfaces --region "$R" \
      --filters "Name=vpc-id,Values=${VPC_ID}" \
      --query "NetworkInterfaces[?RequesterManaged==\`false\`].[NetworkInterfaceId,Attachment.AttachmentId,Attachment.Status]" --output text 2>/dev/null || true)
    while IFS=$'\t' read -r ENI_ID ATTACH_ID ATTACH_STATUS; do
      [[ -z "$ENI_ID" ]] && continue
      if [[ "$ATTACH_STATUS" == "attached" && -n "$ATTACH_ID" && "$ATTACH_ID" != "None" ]]; then
        run "[$R] Detach ENI $ENI_ID ($VPC_NAME)" "aws ec2 detach-network-interface --region $R --attachment-id $ATTACH_ID --force"
        sleep 2
      fi
      run "[$R] Delete ENI $ENI_ID ($VPC_NAME)" "aws ec2 delete-network-interface --region $R --network-interface-id $ENI_ID"
    done <<< "$ENI_DATA"

    # 10d-wait. Drain remaining ENIs before deleting subnets. Service-managed ENIs (VPC endpoints,
    #           NAT, TGW) delete asynchronously after their owner is deleted; a lingering ENI leaves
    #           the subnet with a dependency and fails delete-subnet with DependencyViolation.
    if ! $DRY_RUN; then
      local ENI_WAIT=0
      while [[ $ENI_WAIT -lt 18 ]]; do
        local ENI_REMAIN
        ENI_REMAIN=$(aws_with_timeout ec2 describe-network-interfaces --region "$R" \
          --filters "Name=vpc-id,Values=${VPC_ID}" \
          --query "NetworkInterfaces[].NetworkInterfaceId" --output text 2>/dev/null || true)
        [[ -z "$ENI_REMAIN" ]] && break
        ENI_WAIT=$((ENI_WAIT + 1))
        sleep 10
      done
    fi

    # 10e. Internet Gateways — detach then delete
    local IGW_IDS
    IGW_IDS=$(aws_with_timeout ec2 describe-internet-gateways --region "$R" \
      --filters "Name=attachment.vpc-id,Values=${VPC_ID}" \
      --query "InternetGateways[].InternetGatewayId" --output text 2>/dev/null || true)
    for IGW in $IGW_IDS; do
      run "[$R] Detach IGW $IGW ($VPC_NAME)" "aws ec2 detach-internet-gateway --region $R --internet-gateway-id $IGW --vpc-id $VPC_ID"
      run "[$R] Delete IGW $IGW ($VPC_NAME)" "aws ec2 delete-internet-gateway --region $R --internet-gateway-id $IGW"
    done

    # 10f. Subnets
    local SUBNET_IDS
    SUBNET_IDS=$(aws_with_timeout ec2 describe-subnets --region "$R" \
      --filters "Name=vpc-id,Values=${VPC_ID}" \
      --query "Subnets[].SubnetId" --output text 2>/dev/null || true)
    for SID in $SUBNET_IDS; do
      run "[$R] Delete subnet $SID ($VPC_NAME)" "aws ec2 delete-subnet --region $R --subnet-id $SID"
    done

    # 10g. Route Tables (non-main)
    local RT_IDS
    RT_IDS=$(aws_with_timeout ec2 describe-route-tables --region "$R" \
      --filters "Name=vpc-id,Values=${VPC_ID}" \
      --query "RouteTables[?Associations[0].Main!=\`true\`].RouteTableId" --output text 2>/dev/null || true)
    for RTID in $RT_IDS; do
      local ASSOC_IDS
      ASSOC_IDS=$(aws_with_timeout ec2 describe-route-tables --region "$R" --route-table-ids "$RTID" \
        --query "RouteTables[0].Associations[?!Main].RouteTableAssociationId" --output text 2>/dev/null || true)
      for ASSOC in $ASSOC_IDS; do
        run "[$R] Disassociate route table $RTID ($VPC_NAME)" "aws ec2 disassociate-route-table --region $R --association-id $ASSOC"
      done
      run "[$R] Delete route table $RTID ($VPC_NAME)" "aws ec2 delete-route-table --region $R --route-table-id $RTID"
    done

    # 10h. Security Groups (skip default)
    local SG_IDS
    SG_IDS=$(aws_with_timeout ec2 describe-security-groups --region "$R" \
      --filters "Name=vpc-id,Values=${VPC_ID}" \
      --query "SecurityGroups[?GroupName!='default'].GroupId" --output text 2>/dev/null || true)
    # First remove all ingress/egress rules that reference other SGs (break circular deps)
    for SGID in $SG_IDS; do
      aws_with_timeout ec2 describe-security-group-rules --region "$R" \
        --filters "Name=group-id,Values=$SGID" \
        --query "SecurityGroupRules[?ReferencedGroupInfo!=null].[SecurityGroupRuleId,IsEgress]" --output text 2>/dev/null | \
      while IFS=$'\t' read -r RULE_ID IS_EGRESS; do
        [[ -z "$RULE_ID" ]] && continue
        if [[ "$IS_EGRESS" == "true" ]]; then
          run "[$R] Remove SG egress rule $RULE_ID from $SGID ($VPC_NAME)" \
            "aws ec2 revoke-security-group-egress --region $R --group-id $SGID --security-group-rule-ids $RULE_ID"
        else
          run "[$R] Remove SG ingress rule $RULE_ID from $SGID ($VPC_NAME)" \
            "aws ec2 revoke-security-group-ingress --region $R --group-id $SGID --security-group-rule-ids $RULE_ID"
        fi
      done
    done
    for SGID in $SG_IDS; do
      run "[$R] Delete security group $SGID ($VPC_NAME)" "aws ec2 delete-security-group --region $R --group-id $SGID"
    done

    run "[$R] Delete VPC $VPC_NAME ($VPC_ID)" "aws ec2 delete-vpc --region $R --vpc-id $VPC_ID"
  done

  # 11. Orphaned Elastic IPs (not associated with any resource)
  local ORPHAN_EIPS
  ORPHAN_EIPS=$(aws_with_timeout ec2 describe-addresses --region "$R" \
    --filters "Name=domain,Values=vpc" "$EC2_TAG_FILTER" \
    --query "Addresses[?AssociationId==null].AllocationId" --output text 2>/dev/null || true)
  for EIP in $ORPHAN_EIPS; do
    run "[$R] Release orphaned Elastic IP $EIP" "aws ec2 release-address --region $R --allocation-id $EIP"
  done

  # 12. Resource Groups
  for RG in $RESOURCE_GROUPS; do
    run "[$R] Delete resource group $RG" "aws resource-groups delete-group --region $R --group-name $RG --no-cli-pager"
  done

  echo ""
}

# ──────────────────────────────────────────────────────────────────────
# Wrapper to run cleanup_region in background, writing results to a file
# ──────────────────────────────────────────────────────────────────────
cleanup_region_parallel() {
  local R="$1"
  RESULT_FILE="${RESULTS_DIR}/${R}.results"
  touch "$RESULT_FILE"
  export RESULT_FILE
  echo -e "${RED}── Region: ${R} ──────────────────────────────────────────────${NC}"
  cleanup_region "$R"
}

# ══════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════

echo -e "${RED}=== Fractal Cloud AWS Cleanup ===${NC}"
echo -e "Profile: ${CYAN}${PROFILE:-<environment credentials>}${NC}"
echo -e "Region:  ${CYAN}${REGION:-all enabled regions}${NC}"
echo -e "Dry run: ${CYAN}${DRY_RUN}${NC}"
echo -e "Scope:   ${CYAN}resources tagged ${TAG_KEY}=\"${TAG_VALUE_ENV}\" or ${TAG_KEY}=${TAG_VALUE_AGENT}${NC}"
echo ""

# Verify identity
echo -e "${CYAN}Verifying AWS credentials${PROFILE:+ for profile \'$PROFILE\'}...${NC}"
CALLER_IDENTITY=$(aws sts get-caller-identity --output json 2>&1) || {
  echo -e "${RED}Failed to verify AWS credentials${PROFILE:+ for profile \'$PROFILE\'}.${NC}"
  echo -e "Ensure the credentials are valid${PROFILE:+ and the profile exists in ~/.aws/config}."
  echo "$CALLER_IDENTITY"
  exit 1
}
ACCOUNT_ID=$(echo "$CALLER_IDENTITY" | jq -r '.Account')
CALLER_ARN=$(echo "$CALLER_IDENTITY" | jq -r '.Arn')

echo -e "  Account: ${CYAN}${ACCOUNT_ID}${NC}"
echo -e "  Caller:  ${CYAN}${CALLER_ARN}${NC}"
echo ""

# Fail fast on a missing permission before deleting anything. us-east-1 is always enabled, so it is
# a safe region for the canary reads regardless of the --region argument.
preflight_check "us-east-1"

# IAM Roles (global, not per-region). iam:ListRoles does not return tags and reading them back one
# role at a time does not scale in a populated account, so roles are matched by the prefix the
# platform names them with.
#
# The role this script is itself running as is excluded. If you assumed a role whose name also
# starts with the platform prefix, deleting it mid-run would revoke the credentials doing the
# deleting and strand the rest of the teardown. Both ARN shapes carry the role name in the same
# position: arn:aws:iam::<acct>:role/<name> and arn:aws:sts::<acct>:assumed-role/<name>/<session>.
CALLER_ROLE=$(echo "$CALLER_ARN" | sed -E 's#^arn:aws:(iam|sts)::[0-9]+:(role|assumed-role)/([^/]+).*$#\3#')
IAM_ROLES=$(aws_with_timeout iam list-roles --query "Roles[?starts_with(RoleName, '${IAM_ROLE_PREFIX}') && RoleName != '${CALLER_ROLE}'].RoleName" --output text 2>/dev/null || true)

# Determine regions to scan
if [[ -n "$REGION" ]]; then
  REGIONS="$REGION"
else
  echo -e "${CYAN}Discovering enabled regions...${NC}"
  # describe-regions still needs a region to sign the request. Profiles without a configured default
  # region error out; that error is swallowed by `|| true`, yielding an empty list — the script then
  # processes 0 regions and exits 0 having deleted nothing (observed 2026-07-02 on the 4 accounts whose
  # SSO profiles had no `region =` line). us-east-1 is always enabled, so pin the call to it.
  REGIONS=$(aws_with_timeout ec2 describe-regions --region us-east-1 --query "Regions[].RegionName" --output text 2>/dev/null || true)
  echo -e "  Found ${CYAN}$(echo $REGIONS | wc -w | tr -d ' ')${NC} regions"
  echo ""
  # Fail fast: an empty discovery in the all-regions branch means a credential/permission/config gap,
  # not "nothing to do". Exiting 0 here would silently no-op the whole teardown and report success.
  if [[ -z "${REGIONS// }" ]]; then
    echo -e "${RED}ERROR: region discovery returned no regions — aborting to avoid a silent no-op teardown.${NC}" >&2
    echo -e "${RED}       Check credentials / ec2:DescribeRegions permission, or pass --region explicitly.${NC}" >&2
    exit 1
  fi
fi

if ! $DRY_RUN && ! $YES; then
  WHERE="${REGION:-ALL regions}"
  echo -e "${RED}This deletes all Fractal Cloud resources in account ${ACCOUNT_ID} / ${WHERE}.${NC}"
  echo -e "${RED}Deleted infrastructure and its data cannot be recovered. Run with --dry-run first"
  echo -e "if you have not already reviewed what this would remove.${NC}"
  read -rp "Type the account ID (${ACCOUNT_ID}) to confirm: " CONFIRM
  [[ "$CONFIRM" != "$ACCOUNT_ID" ]] && echo "Aborted." && exit 1
  echo ""
fi

# Run cleanup per region in parallel with throttling
echo -e "${CYAN}Processing regions in parallel (max ${MAX_PARALLEL_REGIONS} concurrent)...${NC}"
echo ""

REGION_PIDS=()
REGION_NAMES=()
REGION_START_TIMES=()
TIMED_OUT_REGIONS=()

# Helper: check running regions and kill any that exceed REGION_TIMEOUT
check_region_timeouts() {
  local NOW
  NOW=$(date +%s)
  STILL_RUNNING=()
  STILL_NAMES=()
  STILL_START_TIMES=()
  for i in "${!REGION_PIDS[@]}"; do
    if kill -0 "${REGION_PIDS[$i]}" 2>/dev/null; then
      local ELAPSED=$(( NOW - REGION_START_TIMES[$i] ))
      if [[ $ELAPSED -ge $REGION_TIMEOUT ]]; then
        echo -e "  ${RED}[TIMEOUT]${NC} Region ${REGION_NAMES[$i]} exceeded ${REGION_TIMEOUT}s — killing"
        kill -TERM "${REGION_PIDS[$i]}" 2>/dev/null || true
        # Give it a moment to terminate gracefully, then force kill
        sleep 2
        kill -9 "${REGION_PIDS[$i]}" 2>/dev/null || true
        TIMED_OUT_REGIONS+=("${REGION_NAMES[$i]}")
        echo "FAILED|[${REGION_NAMES[$i]}] Region cleanup timed out after ${REGION_TIMEOUT}s" >> "${RESULTS_DIR}/${REGION_NAMES[$i]}.results"
      else
        STILL_RUNNING+=("${REGION_PIDS[$i]}")
        STILL_NAMES+=("${REGION_NAMES[$i]}")
        STILL_START_TIMES+=("${REGION_START_TIMES[$i]}")
      fi
    fi
  done
  # Use ${arr[@]+...} guards so an empty array does not trip `set -u` on bash 3.2 (macOS).
  REGION_PIDS=("${STILL_RUNNING[@]+"${STILL_RUNNING[@]}"}")
  REGION_NAMES=("${STILL_NAMES[@]+"${STILL_NAMES[@]}"}")
  REGION_START_TIMES=("${STILL_START_TIMES[@]+"${STILL_START_TIMES[@]}"}")
}

for R in $REGIONS; do
  cleanup_region_parallel "$R" &
  REGION_PIDS+=($!)
  REGION_NAMES+=("$R")
  REGION_START_TIMES+=($(date +%s))

  # Throttle: if we've hit max parallel, wait for one to finish or time out
  while [[ ${#REGION_PIDS[@]} -ge $MAX_PARALLEL_REGIONS ]]; do
    check_region_timeouts
    if [[ ${#REGION_PIDS[@]} -ge $MAX_PARALLEL_REGIONS ]]; then
      sleep 5
    fi
  done
done

# Wait for all remaining region jobs to finish (with timeout enforcement)
while [[ ${#REGION_PIDS[@]} -gt 0 ]]; do
  check_region_timeouts
  if [[ ${#REGION_PIDS[@]} -gt 0 ]]; then
    sleep 5
  fi
done

# Collect results from all region temp files
for R in $REGIONS; do
  RF="${RESULTS_DIR}/${R}.results"
  [[ ! -f "$RF" ]] && continue
  while IFS='|' read -r STATUS DESC; do
    [[ -z "$STATUS" ]] && continue
    case "$STATUS" in
      DELETED) DELETED+=("$DESC") ;;
      NOT_FOUND) NOT_FOUND+=("$DESC") ;;
      IN_PROGRESS) IN_PROGRESS+=("$DESC") ;;
      FAILED) FAILED+=("$DESC") ;;
    esac
  done < "$RF"
done

# IAM Roles (global — run once after all regions)
echo -e "${YELLOW}Deleting IAM roles (${IAM_ROLE_PREFIX}*, global)...${NC}"
for ROLE in $IAM_ROLES; do
  POLICIES=$(aws_with_timeout iam list-attached-role-policies --role-name "$ROLE" --query "AttachedPolicies[].PolicyArn" --output text 2>/dev/null || true)
  for POLICY_ARN in $POLICIES; do
    run "Detach policy from role $ROLE" "aws iam detach-role-policy --role-name $ROLE --policy-arn $POLICY_ARN"
  done
  INLINE_POLICIES=$(aws_with_timeout iam list-role-policies --role-name "$ROLE" --query "PolicyNames[]" --output text 2>/dev/null || true)
  for POLICY_NAME in $INLINE_POLICIES; do
    run "Delete inline policy $POLICY_NAME from role $ROLE" "aws iam delete-role-policy --role-name $ROLE --policy-name $POLICY_NAME"
  done
  run "Delete IAM role $ROLE" "aws iam delete-role --role-name $ROLE"
done

# ──────────────────────────────────────────────────────────────────────
# Report
# ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  CLEANUP REPORT  (${ACCOUNT_ID})${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo ""

if $DRY_RUN; then
  echo -e "${CYAN}Dry run complete. No resources were deleted.${NC}"
  echo "Re-run without --dry-run to delete the resources."
else
  if [[ ${#DELETED[@]} -gt 0 ]]; then
    echo -e "${GREEN}Deleted (${#DELETED[@]}):${NC}"
    for ITEM in "${DELETED[@]}"; do
      echo -e "  ${GREEN}✓${NC} $ITEM"
    done
    echo ""
  fi

  if [[ ${#IN_PROGRESS[@]} -gt 0 ]]; then
    echo -e "${CYAN}Already in progress (${#IN_PROGRESS[@]}):${NC}"
    for ITEM in "${IN_PROGRESS[@]}"; do
      echo -e "  ${CYAN}~${NC} $ITEM"
    done
    echo ""
  fi

  if [[ ${#TIMED_OUT_REGIONS[@]} -gt 0 ]]; then
    echo -e "${RED}Timed out regions (${#TIMED_OUT_REGIONS[@]}):${NC}"
    for ITEM in "${TIMED_OUT_REGIONS[@]}"; do
      echo -e "  ${RED}⏱${NC} $ITEM (killed after ${REGION_TIMEOUT}s)"
    done
    echo ""
  fi

  if [[ ${#NOT_FOUND[@]} -gt 0 ]]; then
    echo -e "${YELLOW}Not found (${#NOT_FOUND[@]}):${NC}"
    for ITEM in "${NOT_FOUND[@]}"; do
      echo -e "  ${YELLOW}-${NC} $ITEM"
    done
    echo ""
  fi

  if [[ ${#FAILED[@]} -gt 0 ]]; then
    echo -e "${RED}Failed (${#FAILED[@]}):${NC}"
    for ITEM in "${FAILED[@]}"; do
      echo -e "  ${RED}✗${NC} $ITEM"
    done
    echo ""
  fi

  echo -e "Total: ${GREEN}${#DELETED[@]} deleted${NC}, ${CYAN}${#IN_PROGRESS[@]} already in progress${NC}, ${YELLOW}${#NOT_FOUND[@]} not found${NC}, ${RED}${#FAILED[@]} failed${NC}"
  echo ""
  echo "Deliberately left in place:"
  echo "  - Anything without the ${TAG_KEY} marker tag, except the two classes AWS cannot tag"
  echo "    at create time: ECS task definition families named fractal-*, and IAM roles named"
  echo "    ${IAM_ROLE_PREFIX}*"
  echo "  - The default VPC in each region"
  echo "  - AWS Organizations OUs and account placement"
  echo "  - CloudTrail history, Cost Explorer data, and IAM identity centre assignments"
  echo ""
  echo "A resource the platform created inside a Fractal-tagged VPC is removed with that VPC even"
  echo "if it carries no marker tag of its own — the VPC cannot be deleted while it is in use."
fi

# ──────────────────────────────────────────────────────────────────────
# Markdown summary (GitHub Step Summary + artifact file)
# ──────────────────────────────────────────────────────────────────────
REPORT_FILE="${RESULTS_DIR}/report-${ACCOUNT_ID}.md"

{
  echo "## AWS Account \`${ACCOUNT_ID}\`"
  echo ""
  if $DRY_RUN; then
    echo "> **Dry run** — no resources were deleted."
  else
    echo "| Status | Count |"
    echo "|--------|------:|"
    echo "| Deleted | ${#DELETED[@]} |"
    echo "| Already in progress | ${#IN_PROGRESS[@]} |"
    echo "| Timed out regions | ${#TIMED_OUT_REGIONS[@]} |"
    echo "| Not found | ${#NOT_FOUND[@]} |"
    echo "| Failed | ${#FAILED[@]} |"
    echo ""
    if [[ ${#FAILED[@]} -gt 0 ]]; then
      echo "<details><summary>Failed (${#FAILED[@]})</summary>"
      echo ""
      for ITEM in "${FAILED[@]}"; do
        echo "- \`${ITEM}\`"
      done
      echo ""
      echo "</details>"
      echo ""
    fi
    if [[ ${#TIMED_OUT_REGIONS[@]} -gt 0 ]]; then
      echo "<details><summary>Timed out regions (${#TIMED_OUT_REGIONS[@]})</summary>"
      echo ""
      for ITEM in "${TIMED_OUT_REGIONS[@]}"; do
        echo "- \`${ITEM}\` (killed after ${REGION_TIMEOUT}s)"
      done
      echo ""
      echo "</details>"
      echo ""
    fi
    if [[ ${#DELETED[@]} -gt 0 ]]; then
      echo "<details><summary>Deleted (${#DELETED[@]})</summary>"
      echo ""
      for ITEM in "${DELETED[@]}"; do
        echo "- ${ITEM}"
      done
      echo ""
      echo "</details>"
      echo ""
    fi
  fi
} > "$REPORT_FILE"

# Keep the report only when the caller asked for it, so a cleanup run never leaves a directory
# behind in whatever folder it happened to be started from.
ARTIFACT_DIR="${REPORT_DIR:-}"
if [[ -n "$ARTIFACT_DIR" ]]; then
  mkdir -p "$ARTIFACT_DIR"
  cp "$REPORT_FILE" "$ARTIFACT_DIR/"
  echo "Report written to ${ARTIFACT_DIR}/$(basename "$REPORT_FILE")"
fi

# ──────────────────────────────────────────────────────────────────────
# Exit status — non-zero if any resource failed to delete, or a region timed out (timeouts are
# recorded as FAILED entries), so the run is safe to chain. Dry runs never record failures and
# always exit 0.
# ──────────────────────────────────────────────────────────────────────
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo -e "${RED}Cleanup completed with ${#FAILED[@]} failure(s). Fix them and re-run — the cleanup is idempotent.${NC}"
  exit 1
fi
