// ---------------------------------------------------------------------------
// Prism — Azure Infrastructure (Bicep)
//
// Resources:
//   - Container App Environment (Consumption plan)
//   - Container App (1 vCPU, 2 GiB RAM, 1 replica, port 3100)
//   - Azure Database for PostgreSQL Flexible Server (B1ms, pgvector)
//   - Azure Key Vault (Standard, RBAC)
//   - Azure Container Registry (Basic)
//   - Managed Identity (system-assigned on Container App, Key Vault Secrets User)
//   - Log Analytics Workspace (required by Container App Environment)
// ---------------------------------------------------------------------------

@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Base name used for resource naming')
param baseName string = 'prism'

@description('PostgreSQL administrator login')
param pgAdminLogin string = 'prismadmin'

@description('PostgreSQL administrator password')
@secure()
param pgAdminPassword string

@description('Database URL (stored in Key Vault)')
@secure()
param databaseUrl string

@description('Anthropic API key')
@secure()
param anthropicApiKey string

@description('Credential encryption key (AES-256-GCM, hex-encoded)')
@secure()
param credentialEncryptionKey string

@description('Session secret for Express sessions')
@secure()
param sessionSecret string

@description('Voyage AI API key (optional)')
@secure()
param voyageApiKey string = ''

@description('OpenAI API key (optional)')
@secure()
param openaiApiKey string = ''

@description('Azure Entra ID tenant ID')
@secure()
param azureTenantId string = ''

@description('Azure Entra ID client ID')
@secure()
param azureClientId string = ''

@description('Azure Entra ID client secret')
@secure()
param azureClientSecret string = ''

@description('Container image (e.g. myacr.azurecr.io/prism:latest)')
param containerImage string = ''

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

var uniqueSuffix = uniqueString(resourceGroup().id, baseName)
var acrName = '${baseName}acr${uniqueSuffix}'
var kvName = '${baseName}-kv-${uniqueSuffix}'
var pgServerName = '${baseName}-pg-${uniqueSuffix}'
var pgDatabaseName = 'prism'
var logAnalyticsName = '${baseName}-logs-${uniqueSuffix}'
var envName = '${baseName}-env-${uniqueSuffix}'
var appName = baseName

// Key Vault Secrets User role definition ID
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

// ---------------------------------------------------------------------------
// Log Analytics Workspace (required by Container App Environment)
// ---------------------------------------------------------------------------

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// ---------------------------------------------------------------------------
// Azure Container Registry (Basic SKU)
// ---------------------------------------------------------------------------

resource acr 'Microsoft.ContainerRegistry/registries@2023-11-01-preview' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

// ---------------------------------------------------------------------------
// Azure Database for PostgreSQL Flexible Server (Burstable B1ms, pgvector)
// ---------------------------------------------------------------------------

resource pgServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: pgServerName
  location: location
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: pgAdminLogin
    administratorLoginPassword: pgAdminPassword
    storage: {
      storageSizeGB: 32
    }
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
  }
}

resource pgDatabase 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: pgServer
  name: pgDatabaseName
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource pgVectorExtension 'Microsoft.DBforPostgreSQL/flexibleServers/configurations@2023-12-01-preview' = {
  parent: pgServer
  name: 'azure.extensions'
  properties: {
    value: 'VECTOR'
    source: 'user-override'
  }
}

// Allow Azure services to connect to the PostgreSQL server
resource pgFirewallRule 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: pgServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ---------------------------------------------------------------------------
// Azure Key Vault (Standard, RBAC access)
// ---------------------------------------------------------------------------

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: kvName
  location: location
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

// Store secrets in Key Vault
resource secretDatabaseUrl 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'DATABASE-URL'
  properties: { value: databaseUrl }
}

resource secretAnthropicApiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'ANTHROPIC-API-KEY'
  properties: { value: anthropicApiKey }
}

resource secretCredentialEncryptionKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'CREDENTIAL-ENCRYPTION-KEY'
  properties: { value: credentialEncryptionKey }
}

resource secretSessionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'SESSION-SECRET'
  properties: { value: sessionSecret }
}

resource secretVoyageApiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'VOYAGE-API-KEY'
  properties: { value: voyageApiKey }
}

resource secretOpenaiApiKey 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'OPENAI-API-KEY'
  properties: { value: openaiApiKey }
}

resource secretAzureTenantId 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AZURE-TENANT-ID'
  properties: { value: azureTenantId }
}

resource secretAzureClientId 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AZURE-CLIENT-ID'
  properties: { value: azureClientId }
}

resource secretAzureClientSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'AZURE-CLIENT-SECRET'
  properties: { value: azureClientSecret }
}

// ---------------------------------------------------------------------------
// Container App Environment (Consumption plan)
// ---------------------------------------------------------------------------

resource containerAppEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: envName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Container App (1 vCPU, 2 GiB, 1 replica, port 3100)
// ---------------------------------------------------------------------------

resource containerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: appName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    managedEnvironmentId: containerAppEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 3100
        transport: 'http'
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
        {
          name: 'database-url'
          keyVaultUrl: secretDatabaseUrl.properties.secretUri
          identity: 'system'
        }
        {
          name: 'anthropic-api-key'
          keyVaultUrl: secretAnthropicApiKey.properties.secretUri
          identity: 'system'
        }
        {
          name: 'credential-encryption-key'
          keyVaultUrl: secretCredentialEncryptionKey.properties.secretUri
          identity: 'system'
        }
        {
          name: 'session-secret'
          keyVaultUrl: secretSessionSecret.properties.secretUri
          identity: 'system'
        }
        {
          name: 'voyage-api-key'
          keyVaultUrl: secretVoyageApiKey.properties.secretUri
          identity: 'system'
        }
        {
          name: 'openai-api-key'
          keyVaultUrl: secretOpenaiApiKey.properties.secretUri
          identity: 'system'
        }
        {
          name: 'azure-tenant-id'
          keyVaultUrl: secretAzureTenantId.properties.secretUri
          identity: 'system'
        }
        {
          name: 'azure-client-id'
          keyVaultUrl: secretAzureClientId.properties.secretUri
          identity: 'system'
        }
        {
          name: 'azure-client-secret'
          keyVaultUrl: secretAzureClientSecret.properties.secretUri
          identity: 'system'
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'prism'
          image: containerImage != '' ? containerImage : 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('1.0')
            memory: '2Gi'
          }
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'ANTHROPIC_API_KEY', secretRef: 'anthropic-api-key' }
            { name: 'CREDENTIAL_ENCRYPTION_KEY', secretRef: 'credential-encryption-key' }
            { name: 'SESSION_SECRET', secretRef: 'session-secret' }
            { name: 'VOYAGE_API_KEY', secretRef: 'voyage-api-key' }
            { name: 'OPENAI_API_KEY', secretRef: 'openai-api-key' }
            { name: 'AZURE_TENANT_ID', secretRef: 'azure-tenant-id' }
            { name: 'AZURE_CLIENT_ID', secretRef: 'azure-client-id' }
            { name: 'AZURE_CLIENT_SECRET', secretRef: 'azure-client-secret' }
            { name: 'DASHBOARD_PORT', value: '3100' }
            { name: 'EMBEDDING_PROVIDER', value: 'voyage' }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

// ---------------------------------------------------------------------------
// RBAC: Grant Container App's managed identity Key Vault Secrets User role
// ---------------------------------------------------------------------------

resource kvRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, containerApp.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: containerApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

output containerAppFqdn string = containerApp.properties.configuration.ingress.fqdn
output acrLoginServer string = acr.properties.loginServer
output keyVaultName string = keyVault.name
output pgServerFqdn string = pgServer.properties.fullyQualifiedDomainName
