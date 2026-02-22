#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# Prism — Azure Resource Creation (two-phase)
#
# Phase 1: Provision all Azure infrastructure via Bicep
# Phase 2: Construct DATABASE_URL from PG FQDN and update Key Vault secret
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

RESOURCE_GROUP="${RESOURCE_GROUP:-prism-rg}"
LOCATION="${LOCATION:-swedencentral}"
TEMPLATE_FILE="deploy/main.bicep"
PARAMETERS_FILE="${PARAMETERS_FILE:-deploy/parameters.local.json}"

echo "=== Prism — Azure Resource Creation ==="
echo "Resource Group: $RESOURCE_GROUP"
echo "Location:       $LOCATION"
echo "Parameters:     $PARAMETERS_FILE"
echo ""

# Read pgAdminPassword from parameters file (needed to construct DATABASE_URL)
PG_ADMIN_LOGIN=$(jq -r '.parameters.pgAdminLogin.value' "$PARAMETERS_FILE")
PG_ADMIN_PASSWORD=$(jq -r '.parameters.pgAdminPassword.value' "$PARAMETERS_FILE")

# ---------------------------------------------------------------------------
# Phase 1: Create resource group + deploy Bicep
# ---------------------------------------------------------------------------

echo "Phase 1/2: Creating resource group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --tags "Owner-Created-By=ewi" \
  --output none
echo "  Done."

echo "Phase 1/2: Deploying infrastructure (Bicep)..."
DEPLOYMENT_OUTPUT=$(az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$TEMPLATE_FILE" \
  --parameters "@$PARAMETERS_FILE" \
  --output json)

# Extract outputs
ACR_LOGIN_SERVER=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.acrLoginServer.value')
APP_FQDN=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.containerAppFqdn.value')
KV_NAME=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.keyVaultName.value')
PG_FQDN=$(echo "$DEPLOYMENT_OUTPUT" | jq -r '.properties.outputs.pgServerFqdn.value')

echo "  Done."

# ---------------------------------------------------------------------------
# Phase 2: Construct DATABASE_URL and update Key Vault
# ---------------------------------------------------------------------------

echo "Phase 2/2: Setting DATABASE-URL in Key Vault..."
DATABASE_URL="postgresql://${PG_ADMIN_LOGIN}:${PG_ADMIN_PASSWORD}@${PG_FQDN}:5432/prism?sslmode=require"

az keyvault secret set \
  --vault-name "$KV_NAME" \
  --name "DATABASE-URL" \
  --value "$DATABASE_URL" \
  --output none

echo "  Done."

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

echo ""
echo "=== Infrastructure Created ==="
echo "Container App FQDN: $APP_FQDN"
echo "ACR Login Server:   $ACR_LOGIN_SERVER"
echo "Key Vault:          $KV_NAME"
echo "PostgreSQL FQDN:    $PG_FQDN"
echo "Database URL:       (set in Key Vault as DATABASE-URL)"
echo ""
echo "Next step: deploy your app with ./deploy/deploy.sh"
