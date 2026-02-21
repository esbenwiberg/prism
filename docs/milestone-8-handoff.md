# Milestone 8 Handoff: Bicep Deployment & Container Entrypoint

## Summary

Added Azure infrastructure-as-code (Bicep) and updated the container entrypoint to run both the web server and worker as co-hosted background processes with proper signal forwarding.

## What Changed

### Updated Files

- **`entrypoint.sh`** -- Updated from single-process (`exec node ... serve`) to dual-process mode. Now starts both `serve` and `worker` as background jobs, traps SIGTERM/SIGINT and forwards to both PIDs, and exits when either child exits.

### New Files

- **`deploy/main.bicep`** -- Azure Bicep template defining all infrastructure:
  - Log Analytics Workspace
  - Azure Container Registry (Basic SKU)
  - Azure Database for PostgreSQL Flexible Server (Burstable B1ms, pgvector extension enabled)
  - Azure Key Vault (Standard, RBAC authorization) with 9 secrets
  - Container App Environment (Consumption plan)
  - Container App (1 vCPU, 2 GiB RAM, 1 replica, port 3100, system-assigned managed identity)
  - RBAC role assignment granting the Container App Key Vault Secrets User access

- **`deploy/parameters.json`** -- Parameter file with placeholder values for all Bicep parameters. Secrets must be replaced before deployment.

- **`deploy/deploy.sh`** -- Deployment wrapper script that orchestrates:
  1. Resource group creation
  2. Bicep infrastructure deployment
  3. ACR image build and push
  4. Container App image update

### Unchanged Files

- **`Dockerfile`** -- Already had correct `ENTRYPOINT ["./entrypoint.sh"]`; no changes needed.
- **`.env.example`** -- Already contained all required environment variables.

## Architecture

```
Container App (single container)
  entrypoint.sh
    +-- node ... serve  (web server, port 3100)  [background]
    +-- node ... worker (job poller, every 5s)    [background]
    +-- trap SIGTERM -> kills both PIDs
```

Key Vault provides secrets to the Container App via managed identity reference. PostgreSQL Flexible Server hosts the database with pgvector. Container Registry stores the Docker image.

## Key Vault Secrets

| Secret Name | Maps To Env Var |
|-------------|----------------|
| DATABASE-URL | DATABASE_URL |
| ANTHROPIC-API-KEY | ANTHROPIC_API_KEY |
| CREDENTIAL-ENCRYPTION-KEY | CREDENTIAL_ENCRYPTION_KEY |
| SESSION-SECRET | SESSION_SECRET |
| VOYAGE-API-KEY | VOYAGE_API_KEY |
| OPENAI-API-KEY | OPENAI_API_KEY |
| AZURE-TENANT-ID | AZURE_TENANT_ID |
| AZURE-CLIENT-ID | AZURE_CLIENT_ID |
| AZURE-CLIENT-SECRET | AZURE_CLIENT_SECRET |

## Deploy Flow

```bash
# 1. Populate deploy/parameters.json with real values
# 2. Run the wrapper script
./deploy/deploy.sh
```

Or manually:

```bash
az group create -n rg-prism -l norwayeast
az deployment group create -g rg-prism --template-file deploy/main.bicep --parameters @deploy/parameters.json
az acr build -r <registry> -t prism:latest .
az containerapp update -n prism -g rg-prism --image <registry>.azurecr.io/prism:latest
```

## Verification

- `npm run build` -- passes
- `npm test` -- 26 test files, 313 tests passing
- Bicep template is syntactically complete (deployment validation requires Azure CLI)

## Risks / Follow-ups

- The PostgreSQL firewall rule allows all Azure services (`0.0.0.0`); consider VNet integration for production hardening.
- Container App is fixed at 1 replica with no autoscaling; sufficient for the single-tenant, no-concurrent-indexing design.
- The `parameters.json` contains placeholder values and must never be committed with real secrets.
- No CI/CD pipeline was created (out of scope per non-goals).
