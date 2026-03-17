import type { PrismConfig } from "@prism/core";
import { escapeHtml, card, button, input, select, checkbox, textarea } from "./components.js";
import { layout } from "./layout.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type SettingsTab = "analysis" | "indexer" | "apikeys" | "dashboard";

// ── Helpers ──────────────────────────────────────────────────────────────────

function tabButton(label: string, tab: SettingsTab, active: SettingsTab): string {
  const isActive = tab === active;
  const activeClasses = "border-purple-500 text-purple-400";
  const inactiveClasses =
    "border-transparent text-slate-400 hover:border-slate-600 hover:text-slate-300";

  return `<button
    class="border-b-2 px-4 py-2 text-sm font-medium transition-colors ${isActive ? activeClasses : inactiveClasses}"
    hx-get="/settings/tab?tab=${tab}"
    hx-target="#settings-panel"
    hx-swap="innerHTML">${escapeHtml(label)}</button>`;
}

function settingsTabs(active: SettingsTab): string {
  return `<div class="flex gap-1 border-b border-slate-700">
  ${tabButton("Providers", "apikeys", active)}
  ${tabButton("Budgets", "analysis", active)}
  ${tabButton("Indexer", "indexer", active)}
  ${tabButton("Dashboard", "dashboard", active)}
</div>`;
}

export function settingsPanel(active: SettingsTab, tabContent: string): string {
  return `<div id="settings-panel">
  ${settingsTabs(active)}
  <div id="settings-content" class="mt-8">
    ${tabContent}
  </div>
</div>`;
}

// ── Analysis Tab ─────────────────────────────────────────────────────────────

const EMBEDDING_PROVIDER_OPTIONS = [
  { value: "voyage", label: "Voyage" },
  { value: "openai", label: "OpenAI" },
  { value: "azure-openai", label: "Azure OpenAI" },
];

export function analysisTabPartial(config: PrismConfig): string {
  return `<form hx-post="/settings/analysis" hx-target="#settings-content" hx-swap="innerHTML">
  <div class="space-y-6">
    <p class="text-sm text-slate-400">Configure spending budgets for each pipeline stage. Models and providers are configured in the API Keys tab.</p>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      ${card("Semantic", `
        <div class="space-y-3">
          ${input("semantic_budgetUsd", "Budget (USD)", {
            type: "number",
            value: String(config.semantic.budgetUsd),
            placeholder: "10.00",
          })}
        </div>
      `)}

      ${card("Analysis", `
        <div class="space-y-3">
          ${input("analysis_budgetUsd", "Budget (USD)", {
            type: "number",
            value: String(config.analysis.budgetUsd),
            placeholder: "5.00",
          })}
        </div>
      `)}

      ${card("Blueprint", `
        <div class="space-y-3">
          ${input("blueprint_budgetUsd", "Budget (USD)", {
            type: "number",
            value: String(config.blueprint.budgetUsd),
            placeholder: "10.00",
          })}
        </div>
      `)}
    </div>

    <!-- Preserve model values so they don't get cleared -->
    <input type="hidden" name="semantic_model" value="${escapeHtml(config.semantic.model)}" />
    <input type="hidden" name="semantic_embeddingProvider" value="${escapeHtml(config.semantic.embeddingProvider)}" />
    <input type="hidden" name="semantic_embeddingModel" value="${escapeHtml(config.semantic.embeddingModel)}" />
    <input type="hidden" name="semantic_embeddingDimensions" value="${String(config.semantic.embeddingDimensions)}" />
    <input type="hidden" name="analysis_model" value="${escapeHtml(config.analysis.model)}" />
    <input type="hidden" name="blueprint_model" value="${escapeHtml(config.blueprint.model)}" />

    <div class="flex justify-end">
      ${button("Save Budgets", { variant: "primary", attrs: 'type="submit"' })}
    </div>
  </div>
</form>`;
}

// ── Indexer Tab ──────────────────────────────────────────────────────────────

export function indexerTabPartial(config: PrismConfig): string {
  const skipPatterns = config.structural.skipPatterns.join("\n");

  return `<form hx-post="/settings/indexer" hx-target="#settings-content" hx-swap="innerHTML">
  <div class="space-y-6">
    <p class="text-sm text-slate-400">Configure indexing behaviour, file size limits, and skip patterns.</p>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      ${card("Indexer", `
        <div class="space-y-3">
          ${input("indexer_batchSize", "Batch Size", {
            type: "number",
            value: String(config.indexer.batchSize),
            placeholder: "100",
          })}
          ${input("indexer_maxConcurrentBatches", "Max Concurrent Batches", {
            type: "number",
            value: String(config.indexer.maxConcurrentBatches),
            placeholder: "4",
          })}
          ${checkbox("indexer_incrementalByDefault", "Incremental by default", config.indexer.incrementalByDefault)}
        </div>
      `)}

      ${card("Structural", `
        <div class="space-y-3">
          ${input("structural_maxFileSizeBytes", "Max File Size (bytes)", {
            type: "number",
            value: String(config.structural.maxFileSizeBytes),
            placeholder: "1048576",
          })}
          ${textarea("structural_skipPatterns", "Skip Patterns (one per line)", {
            value: skipPatterns,
            rows: 8,
            placeholder: "node_modules/**\n.git/**",
          })}
        </div>
      `)}
    </div>

    <div class="flex justify-end">
      ${button("Save Indexer Settings", { variant: "primary", attrs: 'type="submit"' })}
    </div>
  </div>
</form>`;
}

// ── API Keys Tab ─────────────────────────────────────────────────────────────

function maskKey(value: string): string {
  if (!value) return "";
  const last4 = value.slice(-4);
  return `\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022${last4}`;
}

export function apiKeysTabPartial(config: PrismConfig): string {
  const keys = config.apiKeys;
  const llmProvider = keys.anthropicBaseUrl ? "azure-foundry" : "anthropic";
  const embeddingProvider = config.semantic.embeddingProvider;

  const LLM_PROVIDER_OPTIONS = [
    { value: "anthropic", label: "Anthropic (Direct)" },
    { value: "azure-foundry", label: "Azure AI Foundry" },
  ];

  return `<form hx-post="/settings/apikeys" hx-target="#settings-content" hx-swap="innerHTML">
  <div class="space-y-6">
    <p class="text-sm text-slate-400">Configure providers, credentials, and models. Keys are stored encrypted in the database.</p>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      ${card("LLM - Summarization, Analysis & Blueprints", `
        <div class="space-y-3">
          ${select("llmProvider", "Provider", LLM_PROVIDER_OPTIONS, llmProvider,
            'hx-get="/settings/tab?tab=apikeys" hx-target="#settings-panel" hx-swap="innerHTML" hx-include="closest form"')}
          ${llmProvider === "azure-foundry" ? `
            ${input("anthropicBaseUrl", "Foundry Endpoint", {
              value: keys.anthropicBaseUrl ? maskKey(keys.anthropicBaseUrl) : "",
              placeholder: "https://your-resource.services.ai.azure.com/api",
            })}
          ` : ""}
          ${input("anthropicApiKey", "API Key", {
            type: "password",
            value: maskKey(keys.anthropicApiKey),
            placeholder: llmProvider === "azure-foundry" ? "Azure AI Foundry API key" : "Set via ANTHROPIC_API_KEY env var",
          })}
          <hr class="border-slate-700" />
          ${input("semantic_model", "Semantic Model", {
            value: config.semantic.model,
            placeholder: llmProvider === "azure-foundry" ? "Deployment name in Foundry" : "claude-haiku-4-5-20251001",
          })}
          ${input("analysis_model", "Analysis Model", {
            value: config.analysis.model,
            placeholder: llmProvider === "azure-foundry" ? "Deployment name in Foundry" : "claude-sonnet-4-6",
          })}
          ${input("blueprint_model", "Blueprint Model", {
            value: config.blueprint.model,
            placeholder: llmProvider === "azure-foundry" ? "Deployment name in Foundry" : "claude-sonnet-4-6",
          })}
        </div>
      `)}

      ${card("Embeddings - Semantic Search", `
        <div class="space-y-3">
          ${select("embeddingProvider", "Provider", EMBEDDING_PROVIDER_OPTIONS, embeddingProvider,
            'hx-get="/settings/tab?tab=apikeys" hx-target="#settings-panel" hx-swap="innerHTML" hx-include="closest form"')}
          ${embeddingProvider === "azure-openai" ? `
            ${input("azureOpenaiEndpoint", "Endpoint", {
              value: keys.azureOpenaiEndpoint ? maskKey(keys.azureOpenaiEndpoint) : "",
              placeholder: "https://your-resource.openai.azure.com",
            })}
            ${input("azureOpenaiApiKey", "API Key", {
              type: "password",
              value: maskKey(keys.azureOpenaiApiKey),
              placeholder: "Set via AZURE_OPENAI_API_KEY env var",
            })}
          ` : embeddingProvider === "openai" ? `
            ${input("openaiApiKey", "API Key", {
              type: "password",
              value: maskKey(keys.openaiApiKey),
              placeholder: "Set via OPENAI_API_KEY env var",
            })}
          ` : embeddingProvider === "voyage" ? `
            ${input("voyageApiKey", "API Key", {
              type: "password",
              value: maskKey(keys.voyageApiKey),
              placeholder: "Set via VOYAGE_API_KEY env var",
            })}
          ` : ""}
          <hr class="border-slate-700" />
          ${input("semantic_embeddingModel", "Model / Deployment", {
            value: config.semantic.embeddingModel,
            placeholder: embeddingProvider === "azure-openai" ? "Deployment name" : embeddingProvider === "voyage" ? "voyage-code-3" : "text-embedding-3-small",
          })}
          ${input("semantic_embeddingDimensions", "Dimensions", {
            type: "number",
            value: String(config.semantic.embeddingDimensions),
            placeholder: "3072",
          })}
        </div>
      `)}
    </div>

    <!-- Preserve keys not currently visible -->
    ${embeddingProvider !== "azure-openai" ? `
      <input type="hidden" name="azureOpenaiEndpoint" value="${escapeHtml(keys.azureOpenaiEndpoint ? maskKey(keys.azureOpenaiEndpoint) : "")}" />
      <input type="hidden" name="azureOpenaiApiKey" value="${escapeHtml(keys.azureOpenaiApiKey ? maskKey(keys.azureOpenaiApiKey) : "")}" />
    ` : ""}
    ${embeddingProvider !== "openai" ? `
      <input type="hidden" name="openaiApiKey" value="${escapeHtml(keys.openaiApiKey ? maskKey(keys.openaiApiKey) : "")}" />
    ` : ""}
    ${embeddingProvider !== "voyage" ? `
      <input type="hidden" name="voyageApiKey" value="${escapeHtml(keys.voyageApiKey ? maskKey(keys.voyageApiKey) : "")}" />
    ` : ""}
    ${llmProvider !== "azure-foundry" ? `
      <input type="hidden" name="anthropicBaseUrl" value="" />
    ` : ""}

    <div class="flex justify-end">
      ${button("Save", { variant: "primary", attrs: 'type="submit"' })}
    </div>
  </div>
</form>`;
}

// ── Dashboard Tab ────────────────────────────────────────────────────────────

export function dashboardTabPartial(config: PrismConfig): string {
  const corsOrigins = config.dashboard.corsOrigins.join("\n");

  return `<form hx-post="/settings/dashboard" hx-target="#settings-content" hx-swap="innerHTML">
  <div class="space-y-6">
    <p class="text-sm text-slate-400">Configure dashboard behaviour and cross-origin access for the API.</p>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      ${card("CORS", `
        <div class="space-y-3">
          ${textarea("dashboard_corsOrigins", "Allowed Origins (one per line)", {
            value: corsOrigins,
            rows: 6,
            placeholder: "https://example.com\nhttps://app.example.com\n\nUse * to allow all origins",
          })}
          <p class="text-xs text-slate-500">Origins that are allowed to call the Prism API from a browser. Leave empty to block all cross-origin requests.</p>
        </div>
      `)}
    </div>

    <div class="flex justify-end">
      ${button("Save Dashboard Settings", { variant: "primary", attrs: 'type="submit"' })}
    </div>
  </div>
</form>`;
}

// ── Full Page ────────────────────────────────────────────────────────────────

export function settingsPage(
  config: PrismConfig,
  userName: string,
  activeTab: SettingsTab = "analysis",
): string {
  const tabContent =
    activeTab === "apikeys"
      ? apiKeysTabPartial(config)
      : activeTab === "indexer"
        ? indexerTabPartial(config)
        : activeTab === "dashboard"
          ? dashboardTabPartial(config)
          : analysisTabPartial(config);

  const content = `<div class="space-y-8">
  <div>
    <h2 class="text-xl font-semibold text-slate-50">Settings</h2>
    <p class="mt-1 text-sm text-slate-400">Manage AI model configuration and indexer behaviour.</p>
  </div>

  ${settingsPanel(activeTab, tabContent)}
</div>`;

  return layout({ title: "Settings", content, userName, activeNav: "settings" });
}
