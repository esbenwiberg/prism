#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Prism — Deploy (build image + update container app)
#
# Builds the Docker image via ACR Tasks and updates the Container App.
# Run this every time you want to ship a new version.
#
# Usage:
#   ./deploy/deploy.sh
#   ./deploy/deploy.sh --tag v1.2.3
#
# Environment variables (all optional, with defaults):
#   RESOURCE_GROUP   — default: rg-prism
#   ACR_NAME         — auto-detected from deployment outputs if not set
#   IMAGE_TAG        — default: latest
#
# Prerequisites:
#   - Azure CLI (az) installed and logged in
#   - Infrastructure already created via ./deploy/infra.sh
# ---------------------------------------------------------------------------

RESOURCE_GROUP="${RESOURCE_GROUP:-prism-rg}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

# Parse --tag flag
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag) IMAGE_TAG="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Auto-detect ACR name from the deployment if not provided
if [[ -z "${ACR_NAME:-}" ]]; then
  echo "Detecting ACR from resource group $RESOURCE_GROUP..."
  ACR_NAME=$(az acr list \
    --resource-group "$RESOURCE_GROUP" \
    --query "[0].name" \
    --output tsv | tr -d '\r')
  if [[ -z "$ACR_NAME" ]]; then
    echo "Error: No ACR found in $RESOURCE_GROUP. Run ./deploy/infra.sh first."
    exit 1
  fi
fi

ACR_LOGIN_SERVER=$(az acr show --name "$ACR_NAME" --query "loginServer" --output tsv | tr -d '\r')
FULL_IMAGE="$ACR_LOGIN_SERVER/prism:$IMAGE_TAG"

echo "=== Prism — Deploy ==="
echo "Resource Group: $RESOURCE_GROUP"
echo "ACR:            $ACR_LOGIN_SERVER"
echo "Image:          $FULL_IMAGE"
echo ""

# 1. Build and push container image via ACR Tasks
echo "Step 1/2: Building and pushing container image..."
az acr build \
  --registry "$ACR_NAME" \
  --image "prism:$IMAGE_TAG" \
  . \
  --output none
echo "  Done."

# 2. Update container app with the new image (force new revision so Azure pulls the latest tag)
echo "Step 2/2: Updating container app..."
REVISION_SUFFIX="deploy-$(date +%s)"
az containerapp update \
  --name prism \
  --resource-group "$RESOURCE_GROUP" \
  --image "$FULL_IMAGE" \
  --revision-suffix "$REVISION_SUFFIX" \
  --output none

# Get the FQDN for confirmation
APP_FQDN=$(az containerapp show \
  --name prism \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" \
  --output tsv | tr -d '\r')

echo ""
echo "=== Deploy complete ==="
echo "Image:   $FULL_IMAGE"
echo "App URL: https://$APP_FQDN"
