import type { PrismConfig } from "@prism/core";
import { escapeHtml, card, button, input, select, checkbox, textarea } from "./components.js";
import { layout } from "./layout.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type SettingsTab = "analysis" | "indexer";

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
  ${tabButton("Analysis", "analysis", active)}
  ${tabButton("Indexer", "indexer", active)}
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

const MODEL_OPTIONS = [
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (fast)" },
  { value: "claude-sonnet-4-6-20250514", label: "Sonnet 4.6 (balanced)" },
  { value: "claude-opus-4-6", label: "Opus 4.6 (powerful)" },
];

export function analysisTabPartial(config: PrismConfig): string {
  return `<form hx-post="/settings/analysis" hx-target="#settings-content" hx-swap="innerHTML">
  <div class="space-y-6">
    <p class="text-sm text-slate-400">Configure AI models and spending budgets for each pipeline stage.</p>

    <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
      ${card("Semantic", `
        <div class="space-y-3">
          ${select("semantic_model", "Model", MODEL_OPTIONS, config.semantic.model)}
          ${input("semantic_budgetUsd", "Budget (USD)", {
            type: "number",
            value: String(config.semantic.budgetUsd),
            placeholder: "10.00",
          })}
        </div>
      `)}

      ${card("Analysis", `
        <div class="space-y-3">
          ${select("analysis_model", "Model", MODEL_OPTIONS, config.analysis.model)}
          ${input("analysis_budgetUsd", "Budget (USD)", {
            type: "number",
            value: String(config.analysis.budgetUsd),
            placeholder: "5.00",
          })}
        </div>
      `)}

      ${card("Blueprint", `
        <div class="space-y-3">
          ${select("blueprint_model", "Model", MODEL_OPTIONS, config.blueprint.model)}
          ${input("blueprint_budgetUsd", "Budget (USD)", {
            type: "number",
            value: String(config.blueprint.budgetUsd),
            placeholder: "10.00",
          })}
        </div>
      `)}
    </div>

    <div class="flex justify-end">
      ${button("Save Analysis Settings", { variant: "primary", attrs: 'type="submit"' })}
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

// ── Full Page ────────────────────────────────────────────────────────────────

export function settingsPage(
  config: PrismConfig,
  userName: string,
  activeTab: SettingsTab = "analysis",
): string {
  const tabContent =
    activeTab === "analysis" ? analysisTabPartial(config) : indexerTabPartial(config);

  const content = `<div class="space-y-8">
  <div>
    <h2 class="text-xl font-semibold text-slate-50">Settings</h2>
    <p class="mt-1 text-sm text-slate-400">Manage AI model configuration and indexer behaviour.</p>
  </div>

  ${settingsPanel(activeTab, tabContent)}
</div>`;

  return layout({ title: "Settings", content, userName, activeNav: "settings" });
}
