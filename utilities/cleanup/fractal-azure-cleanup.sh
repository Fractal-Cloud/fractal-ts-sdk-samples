#!/usr/bin/env bash
#
# Deletes the Fractal Cloud resource groups in a given Azure subscription.
# Azure resource group deletion cascades to all contained resources.
#
# Deleting an environment in Fractal Cloud stops the management layer and deliberately leaves your
# infrastructure running, so opting out never causes an outage. This script is the separate,
# explicit step that removes that infrastructure — when you are leaving for good, or when a failed
# initialization has to be retried from a clean subscription.
#
# Scope: only resource groups carrying the marker tag `managed-by` with the value "Fractal"
# (written by the environments service during environment initialization) or "fractal-cloud"
# (written by the cloud agents on LiveSystem resources). Every other resource group in the
# subscription is left untouched.
#
# Usage:
#   ./fractal-azure-cleanup.sh --subscription <id> [--dry-run] [--yes]
#
# Start with --dry-run. It performs the same discovery and prints every deletion it would make
# without calling a single delete API.
#
# Prerequisites:
#   - Azure CLI installed and authenticated
#   - Contributor or Owner on the target subscription
#
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

DRY_RUN=false
SUBSCRIPTION=""
YES=false
REPORT_OUT_DIR=""

# ──────────────────────────────────────────────────────────────────────
# Tag scoping
#
# The subscription may hold resource groups this script must never touch, so discovery is scoped to
# the `managed-by` marker tag that Fractal stamps on every resource group it creates
# (AzureResourceGroupInitializer for initialization, AzureResourceGroups for LiveSystems).
#
# Two marker values are in play, because two systems provision into the same subscription:
#   "Fractal"       — the environments service, during environment initialization
#   "fractal-cloud" — the cloud agents, on LiveSystem resources
# Both are matched. A subscription being handed back to its owner should keep neither.
#
# ──────────────────────────────────────────────────────────────────────
TAG_KEY="managed-by"
TAG_VALUE_ENV="Fractal"
TAG_VALUE_AGENT="fractal-cloud"

# Timeouts
AZ_CMD_TIMEOUT=120  # seconds per Azure CLI command

az_with_timeout() {
  timeout "$AZ_CMD_TIMEOUT" az "$@"
}

usage() {
  echo "Usage: $0 --subscription <subscription-id> [--dry-run] [--yes] [--report-dir <path>]"
  echo ""
  echo "Options:"
  echo "  --subscription   Azure subscription ID"
  echo "  --dry-run        Show what would be deleted without actually deleting"
  echo "  --yes            Skip confirmation prompt (for automation)"
  echo "  --report-dir     Directory to write the Markdown run report into. Omit to keep the"
  echo "                   report in a temp directory that is removed on exit."
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --subscription) SUBSCRIPTION="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --yes) YES=true; shift ;;
    --report-dir) REPORT_OUT_DIR="$2"; shift 2 ;;
    *) usage ;;
  esac
done

[[ -z "$SUBSCRIPTION" ]] && usage

DELETED=()
FAILED=()

echo -e "${RED}=== Fractal Cloud Azure Cleanup ===${NC}"
echo -e "Subscription: ${CYAN}${SUBSCRIPTION}${NC}"
echo -e "Dry run:      ${CYAN}${DRY_RUN}${NC}"
echo -e "Scope:        ${CYAN}resource groups tagged ${TAG_KEY}=${TAG_VALUE_ENV} or ${TAG_KEY}=${TAG_VALUE_AGENT}${NC}"
echo ""

# Verify access
echo -e "${CYAN}Verifying Azure credentials...${NC}"
ACCOUNT_INFO=$(az_with_timeout account show --subscription "$SUBSCRIPTION" --output json 2>&1) || {
  echo -e "${RED}Failed to access subscription '${SUBSCRIPTION}'.${NC}"
  echo "$ACCOUNT_INFO"
  exit 1
}
SUB_NAME=$(echo "$ACCOUNT_INFO" | jq -r '.name')
TENANT_ID=$(echo "$ACCOUNT_INFO" | jq -r '.tenantId')

echo -e "  Subscription name: ${CYAN}${SUB_NAME}${NC}"
echo -e "  Tenant:            ${CYAN}${TENANT_ID}${NC}"
echo ""

# Discover resource groups
# Azure Databricks provisions a managed resource group (name prefix `databricks-rg-`) protected by a
# system deny assignment. Deleting it directly returns `DenyAssignmentAuthorizationFailed`; it is
# removed automatically when the parent workspace's resource group is deleted. Exclude it from
# discovery to avoid perpetual false failures.
echo -e "${CYAN}Discovering resource groups...${NC}"
RG_FILTER="starts_with(name, 'databricks-rg-')==\`false\`"
# One predicate, not two chained filters: `[?a][?b]` does not compose in JMESPath — the second
# filter is applied to the elements *of each element* and the result is always empty.
# A group with no tags at all has a null `tags`, and comparing null to a string is false, so
# untagged groups drop out without a separate guard.
RG_FILTER="${RG_FILTER} && (tags.\"${TAG_KEY}\" == '${TAG_VALUE_ENV}' || tags.\"${TAG_KEY}\" == '${TAG_VALUE_AGENT}')"
RG_QUERY="[?${RG_FILTER}]"
RESOURCE_GROUPS=$(az_with_timeout group list --subscription "$SUBSCRIPTION" --query "${RG_QUERY}.name" --output tsv 2>/dev/null || true)

if [[ -z "$RESOURCE_GROUPS" ]]; then
  echo -e "  ${YELLOW}No Fractal Cloud resource groups found, nothing to do.${NC}"
  exit 0
fi

RG_COUNT=$(echo "$RESOURCE_GROUPS" | wc -l | tr -d ' ')
echo -e "  Found ${CYAN}${RG_COUNT}${NC} resource group(s):"
for RG in $RESOURCE_GROUPS; do
  echo -e "    - $RG"
done
echo ""

# Confirm
if ! $DRY_RUN && ! $YES; then
  echo -e "${RED}This deletes the ${RG_COUNT} resource group(s) listed above, and everything inside them,"
  echo -e "in subscription ${SUB_NAME} (${SUBSCRIPTION}).${NC}"
  echo -e "${RED}Deleted infrastructure and its data cannot be recovered. Run with --dry-run first"
  echo -e "if you have not already reviewed what this would remove.${NC}"
  read -rp "Type the subscription ID (${SUBSCRIPTION}) to confirm: " CONFIRM
  [[ "$CONFIRM" != "$SUBSCRIPTION" ]] && echo "Aborted." && exit 1
  echo ""
fi

# Delete resource groups
for RG in $RESOURCE_GROUPS; do
  if $DRY_RUN; then
    echo -e "  ${CYAN}[DRY-RUN]${NC} Would delete resource group $RG"
  else
    echo -e "  ${GREEN}[RUN]${NC} Deleting resource group $RG (async)..."
    if az_with_timeout group delete --subscription "$SUBSCRIPTION" --name "$RG" --yes --no-wait 2>&1; then
      DELETED+=("$RG")
    else
      echo -e "  ${RED}[FAILED]${NC} $RG"
      FAILED+=("$RG")
    fi
  fi
done

# Report
echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  CLEANUP REPORT  (${SUB_NAME})${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo ""

if $DRY_RUN; then
  echo -e "${CYAN}Dry run complete. No resources were deleted.${NC}"
  echo "Re-run without --dry-run to delete the resources."
else
  if [[ ${#DELETED[@]} -gt 0 ]]; then
    echo -e "${GREEN}Deletion initiated (${#DELETED[@]}):${NC}"
    for ITEM in "${DELETED[@]}"; do
      echo -e "  ${GREEN}✓${NC} $ITEM"
    done
    echo ""
    echo -e "${YELLOW}Note: Resource group deletions run asynchronously.${NC}"
    echo -e "${YELLOW}It may take several minutes for all resources to be fully removed.${NC}"
    echo ""
  fi

  if [[ ${#FAILED[@]} -gt 0 ]]; then
    echo -e "${RED}Failed (${#FAILED[@]}):${NC}"
    for ITEM in "${FAILED[@]}"; do
      echo -e "  ${RED}✗${NC} $ITEM"
    done
    echo ""
  fi

  echo -e "Total: ${GREEN}${#DELETED[@]} initiated${NC}, ${RED}${#FAILED[@]} failed${NC}"
fi

# ──────────────────────────────────────────────────────────────────────
# Markdown summary (GitHub Step Summary + artifact file)
# ──────────────────────────────────────────────────────────────────────
REPORT_DIR=$(mktemp -d)
REPORT_FILE="${REPORT_DIR}/report-${SUBSCRIPTION}.md"

{
  echo "## Azure Subscription \`${SUB_NAME}\` (\`${SUBSCRIPTION}\`)"
  echo ""
  if $DRY_RUN; then
    echo "> **Dry run** — no resources were deleted."
  else
    echo "| Status | Count |"
    echo "|--------|------:|"
    echo "| Deletion initiated | ${#DELETED[@]} |"
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
    if [[ ${#DELETED[@]} -gt 0 ]]; then
      echo "<details><summary>Deletion initiated (${#DELETED[@]})</summary>"
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
ARTIFACT_DIR="${REPORT_OUT_DIR:-}"
if [[ -n "$ARTIFACT_DIR" ]]; then
  mkdir -p "$ARTIFACT_DIR"
  cp "$REPORT_FILE" "$ARTIFACT_DIR/"
  echo "Report written to ${ARTIFACT_DIR}/$(basename "$REPORT_FILE")"
fi

# ──────────────────────────────────────────────────────────────────────
# Exit status — non-zero if any resource group failed to delete, so the run is safe to chain.
# Dry runs never record failures and always exit 0.
# ──────────────────────────────────────────────────────────────────────
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo -e "${RED}Cleanup completed with ${#FAILED[@]} failure(s). Fix them and re-run — the cleanup is idempotent.${NC}"
  exit 1
fi
