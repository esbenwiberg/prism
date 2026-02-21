#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Prism — Azure Resource Creation
#
# One-time (or infrequent) script that provisions all Azure infrastructure:
#   Resource Group, Container App Environment, PostgreSQL, Key Vault, ACR
#
# Usage:
#   ./deploy/infra.sh
#
# Environment variables (all optional, with defaults):
#   RESOURCE_GROUP   — default: rg-prism
#   LOCATION         — default: norwayeast
#   PARAMETERS_FILE  — default: deploy/parameters.json
#
# Prerequisites:
#   - Azure CLI (az) installed and logged in
#   - deploy/parameters.json populated with real secret values
# ---------------------------------------------------------------------------

RESOURCE_GROUP="${RESOURCE_GROUP:-rg-prism}"
LOCATION="${LOCATION:-norwayeast}"
TEMPLATE_FILE="deploy/main.bicep"
PARAMETERS_FILE="${PARAMETERS_FILE:-deploy/parameters.json}"

echo "=== Prism — Azure Resource Creation ==="
echo "Resource Group: $RESOURCE_GROUP"
echo "Location:       $LOCATION"
echo "Parameters:     $PARAMETERS_FILE"
echo ""

# 1. Create resource group (idempotent)
echo "Step 1/2: Creating resource group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output none
echo "  Done."

# 2. Deploy infrastructure via Bicep
echo "Step 2/2: Deploying infrastructure (Bicep)..."
DEPLOYMENT_OUTPUT=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$TEMPLATE_FILE" \
  --parameters "@$PARAMETERS_FILE" \
  --output json)

# Extract and display outputs
ACR_LOGIN_SERVER=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.acrLoginServer.value')
APP_FQDN=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.containerAppFqdn.value')
KV_NAME=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.keyVaultName.value')
PG_FQDN=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.pgServerFqdn.value')

echo ""
echo "=== Infrastructure Created ==="
echo "Container App FQDN: $APP_FQDN"
echo "ACR Login Server:   $ACR_LOGIN_SERVER"
echo "Key Vault:          $KV_NAME"
echo "PostgreSQL FQDN:    $PG_FQDN"
echo ""
echo "Next step: deploy your app with ./deploy/deploy.sh"
