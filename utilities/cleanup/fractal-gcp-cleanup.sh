#!/usr/bin/env bash
#
# Discovers and deletes the Fractal Cloud resources in a GCP project.
# Runs in reverse dependency order to avoid "resource in use" errors.
#
# Deleting an environment in Fractal Cloud stops the management layer and deliberately leaves your
# infrastructure running, so opting out never causes an outage. This script is the separate,
# explicit step that removes that infrastructure — when you are leaving for good, or when a failed
# initialization has to be retried from a clean project.
#
# SCOPE — read this before pointing the script at a project.
#
# The AWS and Azure cleanups scope themselves to a `managed-by` marker tag and leave everything else
# in the account alone. GCP cannot work that way. The environments service's footprint here is
# network plumbing — VPC networks, subnets, firewall rules, Cloud Routers, Serverless VPC Access
# connectors, Private Service Access ranges — and GCP supports no labels at all on those resource
# types, so there is nothing to filter on. Matching them by name instead would mean maintaining a
# list of naming conventions across every resource type, which both misses resources and catches
# resources it should not.
#
# The scope is therefore the PROJECT. Everything of a swept type in the named project is deleted,
# whoever created it. GCP's own isolation boundary is the project, and Fractal asks you to nominate
# one per environment — point this only at that project, never at a project that also carries work
# of your own.
#
# Usage:
#   ./fractal-gcp-cleanup.sh --project <project-id> [--dry-run] [--yes]
#
# Start with --dry-run. It performs the same discovery and prints every deletion it would make
# without calling a single delete API. On GCP that dry run is not a formality — it is how you
# confirm the project holds nothing you meant to keep.
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - jq installed
#   - Editor or Owner on the target project
#
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

DRY_RUN=false
PROJECT=""
YES=false
REPORT_OUT_DIR=""

# Timeouts
GCLOUD_CMD_TIMEOUT=120  # seconds per gcloud CLI command

usage() {
  echo "Usage: $0 --project <gcp-project-id> [--dry-run] [--yes] [--report-dir <path>]"
  echo ""
  echo "Options:"
  echo "  --project    GCP project ID"
  echo "  --dry-run    Show what would be deleted without actually deleting"
  echo "  --yes        Skip confirmation prompt (for automation)"
  echo "  --report-dir Directory to write the Markdown run report into. Omit to keep the"
  echo "               report in a temp directory that is removed on exit."
  echo ""
  echo "Scope: the whole project. Unlike the AWS and Azure cleanups this one cannot filter on a"
  echo "marker tag — GCP supports no labels on VPC networks, subnets, firewall rules or routers,"
  echo "which is most of what environment initialization creates. Point it only at a project"
  echo "dedicated to Fractal Cloud."
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --project) PROJECT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    --yes) YES=true; shift ;;
    --report-dir) REPORT_OUT_DIR="$2"; shift 2 ;;
    *) usage ;;
  esac
done

[[ -z "$PROJECT" ]] && usage

gcloud_with_timeout() {
  timeout "$GCLOUD_CMD_TIMEOUT" gcloud "$@"
}

DELETED=()
NOT_FOUND=()
FAILED=()

run() {
  local desc="$1"; shift
  if $DRY_RUN; then
    echo -e "  ${CYAN}[DRY-RUN]${NC} $desc"
    return
  fi
  echo -e "  ${GREEN}[RUN]${NC} $desc"
  local output
  # 3 attempts: transient GCP errors such as "ABORTED: The operation was aborted" (seen on
  # VPC-access connector deletes) usually clear on a subsequent retry.
  local retries=3
  local attempt=0
  local success=false
  while [[ $attempt -lt $retries ]]; do
    attempt=$((attempt + 1))
    local exit_code=0
    output=$(timeout "$GCLOUD_CMD_TIMEOUT" bash -c "$*" 2>&1) || exit_code=$?
    if [[ $exit_code -eq 0 ]]; then
      success=true
      break
    fi
    # Check if it was a timeout
    if [[ $exit_code -eq 124 ]]; then
      echo -e "  ${YELLOW}[TIMEOUT]${NC} $desc (attempt $attempt/$retries)"
      if [[ $attempt -lt $retries ]]; then
        echo -e "  ${CYAN}[RETRY]${NC} Retrying $desc..."
        sleep 5
        continue
      fi
      output="Error: Command timed out after ${GCLOUD_CMD_TIMEOUT}s (${retries} attempts)"
    fi
    # Check for not-found (permanent, don't retry)
    if echo "$output" | grep -qiE "NOT_FOUND|not found|does not exist|was not found|NOT_EXIST"; then
      echo -e "  ${YELLOW}[NOT FOUND]${NC} $desc"
      NOT_FOUND+=("$desc")
      return
    fi
    # Transient error — retry
    if [[ $attempt -lt $retries ]]; then
      echo -e "  ${YELLOW}[ERROR]${NC} $desc (attempt $attempt/$retries) — retrying in 5s..."
      sleep 5
    fi
  done

  if $success; then
    DELETED+=("$desc")
  else
    echo -e "  ${RED}[FAILED]${NC} $desc"
    echo "    $output"
    FAILED+=("$desc: $output")
  fi
}

echo -e "${RED}=== Fractal Cloud GCP Cleanup ===${NC}"
echo -e "Project: ${CYAN}${PROJECT}${NC}"
echo -e "Dry run: ${CYAN}${DRY_RUN}${NC}"
echo -e "Scope:   ${RED}the whole project — every resource of a swept type, whoever created it${NC}"
echo ""

# Verify access
echo -e "${CYAN}Verifying GCP credentials...${NC}"
PROJECT_INFO=$(gcloud projects describe "$PROJECT" --format=json 2>&1) || {
  echo -e "${RED}Failed to access project '${PROJECT}'.${NC}"
  echo "$PROJECT_INFO"
  exit 1
}
PROJECT_NAME=$(echo "$PROJECT_INFO" | jq -r '.name')
PROJECT_NUMBER=$(echo "$PROJECT_INFO" | jq -r '.projectNumber')

echo -e "  Project name:   ${CYAN}${PROJECT_NAME}${NC}"
echo -e "  Project number: ${CYAN}${PROJECT_NUMBER}${NC}"
echo ""

# Note: gcloud has no `databricks` command surface — GCP Databricks workspaces are managed only via
# the separate Databricks CLI (account auth), not gcloud/WIF. We do not delete workspaces here;
# their orphaned Databricks-managed `component-*` VPC networks are torn down via the VPC path below.

# ──────────────────────────────────────────────────────────────────────
# Discovery
# ──────────────────────────────────────────────────────────────────────
echo -e "${CYAN}Discovering resources...${NC}"

# GKE Clusters
GKE_CLUSTERS=$(gcloud_with_timeout container clusters list --project "$PROJECT" --format="value(name,location)" 2>/dev/null || true)

# Cloud Run Services
CLOUD_RUN_SERVICES=$(gcloud_with_timeout run services list --project "$PROJECT" --format="value(metadata.name,region)" 2>/dev/null || true)

# Cloud SQL Instances
SQL_INSTANCES=$(gcloud_with_timeout sql instances list --project "$PROJECT" --format="value(name)" 2>/dev/null || true)

# Pub/Sub Topics
PUBSUB_TOPICS=$(gcloud_with_timeout pubsub topics list --project "$PROJECT" --format="value(name)" 2>/dev/null | grep -v "^$" || true)

# Cloud Storage Buckets
GCS_BUCKETS=$(gcloud_with_timeout storage buckets list --project "$PROJECT" --format="value(name)" 2>/dev/null || true)

# Compute Instances
COMPUTE_INSTANCES=$(gcloud_with_timeout compute instances list --project "$PROJECT" --format="value(name,zone)" 2>/dev/null || true)

# Load Balancers (forwarding rules)
FORWARDING_RULES=$(gcloud_with_timeout compute forwarding-rules list --project "$PROJECT" --format="value(name,region)" 2>/dev/null || true)
GLOBAL_FORWARDING_RULES=$(gcloud_with_timeout compute forwarding-rules list --project "$PROJECT" --global --format="value(name)" 2>/dev/null || true)

# Target Pools / Backend Services
BACKEND_SERVICES=$(gcloud_with_timeout compute backend-services list --project "$PROJECT" --format="value(name)" 2>/dev/null || true)
TARGET_POOLS=$(gcloud_with_timeout compute target-pools list --project "$PROJECT" --format="value(name,region)" 2>/dev/null || true)
HEALTH_CHECKS=$(gcloud_with_timeout compute health-checks list --project "$PROJECT" --format="value(name)" 2>/dev/null || true)
URL_MAPS=$(gcloud_with_timeout compute url-maps list --project "$PROJECT" --format="value(name)" 2>/dev/null || true)
TARGET_HTTP_PROXIES=$(gcloud_with_timeout compute target-http-proxies list --project "$PROJECT" --format="value(name)" 2>/dev/null || true)
TARGET_HTTPS_PROXIES=$(gcloud_with_timeout compute target-https-proxies list --project "$PROJECT" --format="value(name)" 2>/dev/null || true)

# DNS Zones
DNS_ZONES=$(gcloud_with_timeout dns managed-zones list --project "$PROJECT" --format="value(name)" 2>/dev/null || true)

# Firewall Rules
FIREWALL_RULES=$(gcloud_with_timeout compute firewall-rules list --project "$PROJECT" --format="value(name)" 2>/dev/null || true)

# VPC Access Connectors (Serverless VPC Access) — regional: `connectors list` REQUIRES --region
# (a bare list errors out), so sweep every region. A missed connector keeps its host VPC in use
# (via an auto-managed *-connector-*fw firewall) and fails the VPC deletion in step 14.
VPC_CONNECTORS=""
CONNECTOR_TAB=$'\t'
CONNECTOR_NL=$'\n'
GCP_REGIONS=$(gcloud_with_timeout compute regions list --project "$PROJECT" --format="value(name)" 2>/dev/null || true)
for CONN_REGION in $GCP_REGIONS; do
  REGION_CONNECTORS=$(gcloud_with_timeout compute networks vpc-access connectors list --project "$PROJECT" --region "$CONN_REGION" --format="value(name)" 2>/dev/null || true)
  for CONN_NAME in $REGION_CONNECTORS; do
    VPC_CONNECTORS="${VPC_CONNECTORS}${CONN_NAME}${CONNECTOR_TAB}${CONN_REGION}${CONNECTOR_NL}"
  done
done

# Global Addresses — Private Service Access reservations (google-managed-services-*)
PSA_ADDRESSES=$(gcloud_with_timeout compute addresses list --project "$PROJECT" --global \
  --filter="name~'^google-managed-services-'" --format="value(name)" 2>/dev/null || true)

# Cloud Routers (regional) — a router (e.g. the `fc-egress-router` backing Cloud NAT) keeps its host
# network in use and blocks the VPC deletion in step 15 with "network is already being used by
# .../routers/...". Must be torn down before subnets/network. Carry the network so we can skip
# routers on the default network (Databricks-managed `component-` network routers are torn down too).
CLOUD_ROUTERS=$(gcloud_with_timeout compute routers list --project "$PROJECT" --format="value(name,region,network)" 2>/dev/null || true)

# VPC Networks (non-default).
# Databricks-managed networks (name prefix `component-`) are provisioned by a Databricks workspace and
# normally removed when that workspace is deleted. gcloud cannot delete GCP Databricks workspaces (no
# gcloud surface), so a workspace torn down out of band leaves its `component-*` network orphaned. We
# therefore include them here and tear them down as ordinary residue via the VPC path (the cleanup SA
# has roles/editor, i.e. compute.networks.delete). Only the `default` network is excluded.
VPC_NETWORKS=$(gcloud_with_timeout compute networks list --project "$PROJECT" --format="value(name)" 2>/dev/null | grep -v "^default$" || true)

# Check if there's anything to do
HAS_RESOURCES=false
for VAR in "$GKE_CLUSTERS" "$CLOUD_RUN_SERVICES" "$SQL_INSTANCES" "$PUBSUB_TOPICS" \
           "$GCS_BUCKETS" "$COMPUTE_INSTANCES" "$FORWARDING_RULES" "$GLOBAL_FORWARDING_RULES" \
           "$BACKEND_SERVICES" "$DNS_ZONES" "$FIREWALL_RULES" "$VPC_NETWORKS" \
           "$VPC_CONNECTORS" "$PSA_ADDRESSES" "$CLOUD_ROUTERS"; do
  if [[ -n "$VAR" ]]; then
    HAS_RESOURCES=true
    break
  fi
done

if ! $HAS_RESOURCES; then
  echo -e "  ${YELLOW}No resources found, nothing to do.${NC}"
  exit 0
fi

# Confirm
if ! $DRY_RUN && ! $YES; then
  echo -e "${RED}This deletes the resources listed above from project ${PROJECT}. The scope is the whole"
  echo -e "project, not only Fractal-created resources — anything of a swept type goes with them.${NC}"
  echo -e "${RED}Deleted infrastructure and its data cannot be recovered. Run with --dry-run first"
  echo -e "if you have not already reviewed what this would remove.${NC}"
  read -rp "Type the project ID (${PROJECT}) to confirm: " CONFIRM
  [[ "$CONFIRM" != "$PROJECT" ]] && echo "Aborted." && exit 1
  echo ""
fi

# ──────────────────────────────────────────────────────────────────────
# Deletion (reverse dependency order)
# ──────────────────────────────────────────────────────────────────────

# 2. Cloud Run Services
while IFS=$'\t' read -r NAME REGION; do
  [[ -z "$NAME" ]] && continue
  run "Delete Cloud Run service $NAME ($REGION)" "gcloud run services delete $NAME --project $PROJECT --region $REGION --quiet"
done <<< "$CLOUD_RUN_SERVICES"

# 3. GKE Clusters
while IFS=$'\t' read -r NAME LOCATION; do
  [[ -z "$NAME" ]] && continue
  run "Delete GKE cluster $NAME ($LOCATION)" "gcloud container clusters delete $NAME --project $PROJECT --location $LOCATION --quiet --async"
done <<< "$GKE_CLUSTERS"

# 4. Compute Instances
while IFS=$'\t' read -r NAME ZONE; do
  [[ -z "$NAME" ]] && continue
  run "Delete compute instance $NAME ($ZONE)" "gcloud compute instances delete $NAME --project $PROJECT --zone $ZONE --quiet"
done <<< "$COMPUTE_INSTANCES"

# 5. Load Balancer components (forwarding rules → proxies → url maps → backend services → health checks)
while IFS=$'\t' read -r NAME REGION; do
  [[ -z "$NAME" ]] && continue
  run "Delete forwarding rule $NAME ($REGION)" "gcloud compute forwarding-rules delete $NAME --project $PROJECT --region $REGION --quiet"
done <<< "$FORWARDING_RULES"
for NAME in $GLOBAL_FORWARDING_RULES; do
  run "Delete global forwarding rule $NAME" "gcloud compute forwarding-rules delete $NAME --project $PROJECT --global --quiet"
done
for NAME in $TARGET_HTTP_PROXIES; do
  run "Delete target HTTP proxy $NAME" "gcloud compute target-http-proxies delete $NAME --project $PROJECT --quiet"
done
for NAME in $TARGET_HTTPS_PROXIES; do
  run "Delete target HTTPS proxy $NAME" "gcloud compute target-https-proxies delete $NAME --project $PROJECT --quiet"
done
for NAME in $URL_MAPS; do
  run "Delete URL map $NAME" "gcloud compute url-maps delete $NAME --project $PROJECT --quiet"
done
for NAME in $BACKEND_SERVICES; do
  run "Delete backend service $NAME" "gcloud compute backend-services delete $NAME --project $PROJECT --global --quiet"
done
while IFS=$'\t' read -r NAME REGION; do
  [[ -z "$NAME" ]] && continue
  run "Delete target pool $NAME ($REGION)" "gcloud compute target-pools delete $NAME --project $PROJECT --region $REGION --quiet"
done <<< "$TARGET_POOLS"
for NAME in $HEALTH_CHECKS; do
  run "Delete health check $NAME" "gcloud compute health-checks delete $NAME --project $PROJECT --quiet"
done

# 6. Cloud SQL Instances
for INSTANCE in $SQL_INSTANCES; do
  run "Delete Cloud SQL instance $INSTANCE" "gcloud sql instances delete $INSTANCE --project $PROJECT --quiet --async"
done

# 7. Pub/Sub Topics
for TOPIC in $PUBSUB_TOPICS; do
  run "Delete Pub/Sub topic $TOPIC" "gcloud pubsub topics delete $TOPIC --project $PROJECT --quiet"
done

# 8. Cloud Storage Buckets
for BUCKET in $GCS_BUCKETS; do
  run "Delete GCS bucket $BUCKET" "gcloud storage rm --recursive gs://$BUCKET --project $PROJECT --quiet"
done

# 9. DNS Zones (delete records first, then zone)
for ZONE in $DNS_ZONES; do
  # Delete all non-NS/SOA record sets
  RECORDS=$(gcloud_with_timeout dns record-sets list --zone "$ZONE" --project "$PROJECT" \
    --format="value(name,type)" --filter="type!=NS AND type!=SOA" 2>/dev/null || true)
  while IFS=$'\t' read -r RNAME RTYPE; do
    [[ -z "$RNAME" ]] && continue
    run "Delete DNS record $RNAME ($RTYPE) in zone $ZONE" \
      "gcloud dns record-sets delete $RNAME --zone $ZONE --type $RTYPE --project $PROJECT --quiet"
  done <<< "$RECORDS"
  run "Delete DNS zone $ZONE" "gcloud dns managed-zones delete $ZONE --project $PROJECT --quiet"
done

# 10. Firewall Rules
for RULE in $FIREWALL_RULES; do
  run "Delete firewall rule $RULE" "gcloud compute firewall-rules delete $RULE --project $PROJECT --quiet"
done

# 10.5 Cloud Routers (must go before subnets/network — a router backing Cloud NAT holds the
#       network in use and, via Cloud NAT, references the subnets). Skip routers on the default
#       network only (RNETWORK is the network's self-link, so match the trailing name segment).
#       Routers on Databricks-managed `component-` networks are torn down too, so their orphaned
#       networks can be deleted in step 14.
while IFS=$'\t' read -r RNAME RREGION RNETWORK; do
  [[ -z "$RNAME" ]] && continue
  case "${RNETWORK##*/}" in
    default) continue ;;
  esac
  run "Delete Cloud Router $RNAME ($RREGION)" "gcloud compute routers delete $RNAME --project $PROJECT --region $RREGION --quiet"
done <<< "$CLOUD_ROUTERS"

# 11. Subnets (in non-default VPCs)
for NETWORK in $VPC_NETWORKS; do
  SUBNETS=$(gcloud_with_timeout compute networks subnets list --project "$PROJECT" \
    --filter="network:$NETWORK" --format="value(name,region)" 2>/dev/null || true)
  while IFS=$'\t' read -r SNAME SREGION; do
    [[ -z "$SNAME" ]] && continue
    run "Delete subnet $SNAME ($SREGION)" "gcloud compute networks subnets delete $SNAME --project $PROJECT --region $SREGION --quiet"
  done <<< "$SUBNETS"
done

# 12. VPC Access Connectors (must go before VPC)
while IFS=$'\t' read -r NAME REGION; do
  [[ -z "$NAME" ]] && continue
  run "Delete VPC Access connector $NAME ($REGION)" "gcloud compute networks vpc-access connectors delete $NAME --region $REGION --project $PROJECT --quiet"
done <<< "$VPC_CONNECTORS"

# 12-wait. Drain connectors before touching the VPC. `connectors delete` returns as soon as the
#          delete is accepted, but the connector's managed subnetwork (`*-connector-sbnt`) and
#          instance group (`*-connector`) linger while it finishes tearing down asynchronously.
#          Deleting the host network in that window fails with "subnetwork ... is already being
#          used by ... instanceGroups/..." (observed 2026-07-02 on evergreen-496507-host). Poll
#          each connector's region until it is gone before proceeding.
if ! $DRY_RUN; then
  while IFS=$'\t' read -r NAME REGION; do
    [[ -z "$NAME" ]] && continue
    echo "  Waiting for VPC Access connector $NAME ($REGION) to drain..."
    CONN_WAIT=0
    while [[ $CONN_WAIT -lt 40 ]]; do
      CONN_STILL=$(gcloud_with_timeout compute networks vpc-access connectors describe "$NAME" \
        --region "$REGION" --project "$PROJECT" --format="value(name)" 2>/dev/null || true)
      [[ -z "$CONN_STILL" ]] && break
      CONN_WAIT=$((CONN_WAIT + 1))
      sleep 15
    done
  done <<< "$VPC_CONNECTORS"
fi

# 13. Private Service Access addresses (must go before VPC)
for ADDR in $PSA_ADDRESSES; do
  run "Delete PSA address $ADDR" "gcloud compute addresses delete $ADDR --global --project $PROJECT --quiet"
done

# 13.5 VPC Network Peerings (must go before VPC network delete). A Private Service Access
#      connection leaves a `servicenetworking-googleapis-com` peering (and its `peering-route-*`
#      routes) on the host network; GCP refuses to delete a network that still has peerings and
#      reports the leftover routes as "already being used by .../routes/peering-route-*" (deleting
#      the PSA global address in step 13 does not remove the peering). Observed 2026-07-02 on
#      fractal-demo-0-host / fractal-demo-1-host. Remove every peering so its routes drain first.
for NETWORK in $VPC_NETWORKS; do
  PEERINGS=$(gcloud_with_timeout compute networks peerings list --project "$PROJECT" \
    --network "$NETWORK" --format="value(peerings[].name)" 2>/dev/null || true)
  for PEERING in $PEERINGS; do
    run "Delete VPC peering $PEERING ($NETWORK)" \
      "gcloud compute networks peerings delete $PEERING --network $NETWORK --project $PROJECT --quiet"
  done
done

# 13.6 Leftover routes on the network (must go before VPC network delete). Once the subnets are
#      gone, a custom-mode host network can still carry a default internet route (named
#      `default-route-*`, next hop default-internet-gateway) plus any user-created static routes;
#      these are NOT torn down with the network and block the delete with "already being used by
#      .../routes/default-route-*" (observed 2026-07-02 on fractal-demo-0-host after the PSA peering
#      was removed). Subnet routes (`default-route-r-*`) are managed by their subnet and are already
#      gone by this point, so deleting the remaining routes is safe.
for NETWORK in $VPC_NETWORKS; do
  NET_ROUTES=$(gcloud_with_timeout compute routes list --project "$PROJECT" \
    --filter="network ~ /${NETWORK}\$" --format="value(name)" 2>/dev/null || true)
  for ROUTE in $NET_ROUTES; do
    run "Delete route $ROUTE ($NETWORK)" "gcloud compute routes delete $ROUTE --project $PROJECT --quiet"
  done
done

# 14. VPC Networks (non-default)
for NETWORK in $VPC_NETWORKS; do
  run "Delete VPC network $NETWORK" "gcloud compute networks delete $NETWORK --project $PROJECT --quiet"
done

# ──────────────────────────────────────────────────────────────────────
# Report
# ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  CLEANUP REPORT  (${PROJECT})${NC}"
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

  echo -e "Total: ${GREEN}${#DELETED[@]} deleted${NC}, ${YELLOW}${#NOT_FOUND[@]} not found${NC}, ${RED}${#FAILED[@]} failed${NC}"
  echo ""
  echo "Deliberately left in place:"
  echo "  - The default VPC network"
  echo "  - IAM service accounts"
  echo "  - The project itself, its folder placement, and its billing link"
  echo ""
  echo "Everything else of a swept type in this project was in scope, Fractal-created or not — GCP"
  echo "offers no label on the resource types environment initialization creates, so there is"
  echo "nothing narrower to scope to. See the SCOPE note at the top of this script."
fi

# ──────────────────────────────────────────────────────────────────────
# Markdown summary (GitHub Step Summary + artifact file)
# ──────────────────────────────────────────────────────────────────────
REPORT_DIR=$(mktemp -d)
REPORT_FILE="${REPORT_DIR}/report-${PROJECT}.md"

{
  echo "## GCP Project \`${PROJECT}\`"
  echo ""
  if $DRY_RUN; then
    echo "> **Dry run** — no resources were deleted."
  else
    echo "| Status | Count |"
    echo "|--------|------:|"
    echo "| Deleted | ${#DELETED[@]} |"
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
ARTIFACT_DIR="${REPORT_OUT_DIR:-}"
if [[ -n "$ARTIFACT_DIR" ]]; then
  mkdir -p "$ARTIFACT_DIR"
  cp "$REPORT_FILE" "$ARTIFACT_DIR/"
  echo "Report written to ${ARTIFACT_DIR}/$(basename "$REPORT_FILE")"
fi

# ──────────────────────────────────────────────────────────────────────
# Exit status — non-zero if any resource failed to delete, so the run is safe to chain.
# Dry runs never record failures and always exit 0.
# ──────────────────────────────────────────────────────────────────────
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo -e "${RED}Cleanup completed with ${#FAILED[@]} failure(s). Fix them and re-run — the cleanup is idempotent.${NC}"
  exit 1
fi
