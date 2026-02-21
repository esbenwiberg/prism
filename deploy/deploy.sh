#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Prism — Azure Deployment Wrapper
#
# Usage:
#   ./deploy/deploy.sh [--resource-group rg-prism] [--location norwayeast]
#
# Prerequisites:
#   - Azure CLI (az) installed and logged in
#   - deploy/parameters.json populated with real secret values
#   - Docker image built (or let this script build via ACR)
# ---------------------------------------------------------------------------

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-prism}"
LOCATION="${LOCATION:-norwayeast}"
TEMPLATE_FILE="deploy/main.bicep"
PARAMETERS_FILE="deploy/parameters.json"

echo "=== Prism Azure Deployment ==="
echo "Resource Group: $RESOURCE_GROUP"
echo "Location:       $LOCATION"
echo ""

# 1. Create resource group (idempotent)
echo "Step 1: Creating resource group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none

# 2. Deploy infrastructure via Bicep
echo "Step 2: Deploying infrastructure (Bicep)..."
DEPLOYMENT_OUTPUT=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$TEMPLATE_FILE" \
  --parameters "@$PARAMETERS_FILE" \
  --output json)

# Extract outputs
ACR_LOGIN_SERVER=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.acrLoginServer.value')
APP_FQDN=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.containerAppFqdn.value')

echo "  ACR:  $ACR_LOGIN_SERVER"
echo "  FQDN: $APP_FQDN"
echo ""

# 3. Build and push container image via ACR
ACR_NAME=$(echo "$ACR_LOGIN_SERVER" | cut -d. -f1)
IMAGE_TAG="$ACR_LOGIN_SERVER/prism:latest"

echo "Step 3: Building and pushing container image..."
az acr build \
  --registry "$ACR_NAME" \
  --image "prism:latest" \
  . \
  --output none

# 4. Update container app with the new image
echo "Step 4: Updating container app with new image..."
az containerapp update \
  --name prism \
  --resource-group "$RESOURCE_GROUP" \
  --image "$IMAGE_TAG" \
  --output none

echo ""
echo "=== Deployment complete ==="
echo "Application URL: https://$APP_FQDN"
