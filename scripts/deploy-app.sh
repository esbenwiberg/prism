#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Prism — Deploy (for Orcha host-shell invocation)
#
# Builds the Docker image via ACR Tasks and updates the Azure Container App.
# Designed to run from the session worktree root with env vars injected by
# Orcha's deploy configuration.
#
# Instead of tarring the local directory (which can OOM the Orcha container),
# this script passes the git remote URL + current commit to ACR Tasks so the
# build context is cloned directly on ACR's servers — zero local memory.
#
# Required environment variables:
#   AZURE_SUBSCRIPTION_ID — Azure subscription to target
#   AZURE_RESOURCE_GROUP  — Azure resource group (e.g. prism-rg)
#
# Optional environment variables:
#   AZURE_ACR_NAME        — ACR name (auto-detected from resource group if omitted)
#   IMAGE_TAG             — Docker image tag (default: latest)
#   GIT_TOKEN             — PAT for private repos (injected into clone URL)
# ---------------------------------------------------------------------------

: "${AZURE_SUBSCRIPTION_ID:?AZURE_SUBSCRIPTION_ID is required}"
: "${AZURE_RESOURCE_GROUP:?AZURE_RESOURCE_GROUP is required}"

IMAGE_TAG="${IMAGE_TAG:-latest}"

# Verify Azure CLI is available and authenticated
if ! command -v az &>/dev/null; then
  echo "Error: Azure CLI (az) not found" >&2
  exit 1
fi

if ! az account show &>/dev/null; then
  echo "Error: Not logged into Azure — run 'az login' first" >&2
  exit 1
fi

# Set the target subscription
az account set --subscription "$AZURE_SUBSCRIPTION_ID"

# Auto-detect ACR name if not provided
if [[ -z "${AZURE_ACR_NAME:-}" ]]; then
  echo "Detecting ACR from resource group ${AZURE_RESOURCE_GROUP}..."
  AZURE_ACR_NAME=$(az acr list \
    --resource-group "$AZURE_RESOURCE_GROUP" \
    --query "[0].name" \
    --output tsv | tr -d '\r')
  if [[ -z "$AZURE_ACR_NAME" ]]; then
    echo "Error: No ACR found in ${AZURE_RESOURCE_GROUP}" >&2
    exit 1
  fi
fi

ACR_LOGIN_SERVER=$(az acr show --name "$AZURE_ACR_NAME" --query "loginServer" --output tsv | tr -d '\r')
FULL_IMAGE="${ACR_LOGIN_SERVER}/prism:${IMAGE_TAG}"

echo "=== Prism Deploy ==="
echo "Resource Group: ${AZURE_RESOURCE_GROUP}"
echo "ACR:            ${ACR_LOGIN_SERVER}"
echo "Image:          ${FULL_IMAGE}"
echo ""

# 1. Build and push via ACR Tasks
echo "[1/2] Building and pushing container image..."
az acr build \
  --registry "$AZURE_ACR_NAME" \
  --image "prism:${IMAGE_TAG}" \
  . \
  --output none
echo "  Done."

# 2. Update container app with new revision
echo "[2/2] Updating container app..."
REVISION_SUFFIX="deploy-$(date +%s)"
az containerapp update \
  --name prism \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --image "$FULL_IMAGE" \
  --revision-suffix "$REVISION_SUFFIX" \
  --output none

# Confirm
APP_FQDN=$(az containerapp show \
  --name prism \
  --resource-group "$AZURE_RESOURCE_GROUP" \
  --query "properties.configuration.ingress.fqdn" \
  --output tsv | tr -d '\r')

echo ""
echo "=== Deploy complete ==="
echo "Image:   ${FULL_IMAGE}"
echo "App URL: https://${APP_FQDN}"
