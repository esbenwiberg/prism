/**
 * Configuration loader for Prism.
 *
 * Loads settings from `prism.config.yaml` (relative to the current working
 * directory), merges with built-in defaults, and applies environment-variable
 * overrides.
 *
 * Usage:
 *   initConfig();          // call once at startup (optional — getConfig lazily loads)
 *   const cfg = getConfig();
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { logger } from "../logger.js";
import type { ApiKeysConfig, PrismConfig } from "./types.js";
import { getDbSettings, saveDbSettings } from "../db/queries/settings.js";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: PrismConfig = {
  structural: {
    skipPatterns: [
      "node_modules/**",
      ".git/**",
      "dist/**",
      "build/**",
      "vendor/**",
      "*.min.js",
      "*.min.css",
      "*.lock",
      "*.map",
    ],
    maxFileSizeBytes: 1_048_576, // 1 MB
  },
  purpose: {
    enabled: true,
    model: "claude-sonnet-4-6",
    budgetUsd: 2.0,
  },
  semantic: {
    enabled: true,
    model: "claude-haiku-4-5-20251001",
    embeddingProvider: "voyage",
    embeddingModel: "voyage-code-3",
    embeddingDimensions: 3072,
    budgetUsd: 10.0,
  },
  analysis: {
    enabled: true,
    model: "claude-sonnet-4-6",
    budgetUsd: 5.0,
  },
  blueprint: {
    enabled: true,
    model: "claude-sonnet-4-6",
    budgetUsd: 10.0,
  },
  indexer: {
    batchSize: 100,
    maxConcurrentBatches: 4,
    incrementalByDefault: true,
  },
  dashboard: {
    port: 3100,
  },
  apiKeys: {
    anthropicApiKey: "",
    azureOpenaiApiKey: "",
    azureOpenaiEndpoint: "",
    voyageApiKey: "",
    openaiApiKey: "",
  },
};

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _config: PrismConfig | undefined;

/**
 * Deep-merge `source` into `target`. Only merges plain objects; arrays and
 * primitives in `source` overwrite the corresponding key in `target`.
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];
    if (
      srcVal !== null &&
      typeof srcVal === "object" &&
      !Array.isArray(srcVal) &&
      tgtVal !== null &&
      typeof tgtVal === "object" &&
      !Array.isArray(tgtVal)
    ) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else {
      result[key] = srcVal;
    }
  }
  return result as T;
}

/**
 * Apply environment-variable overrides using the convention
 * `PRISM_<SECTION>_<KEY>` (e.g. `PRISM_DASHBOARD_PORT=4000`).
 *
 * Only known top-level sections and their keys are considered.
 */
function applyEnvOverrides(config: PrismConfig): PrismConfig {
  const envMap: Array<{
    envVar: string;
    apply: (cfg: PrismConfig, value: string) => void;
  }> = [
    {
      envVar: "PRISM_DASHBOARD_PORT",
      apply: (cfg, v) => {
        cfg.dashboard.port = parseInt(v, 10);
      },
    },
    {
      envVar: "PRISM_INDEXER_BATCH_SIZE",
      apply: (cfg, v) => {
        cfg.indexer.batchSize = parseInt(v, 10);
      },
    },
    {
      envVar: "PRISM_INDEXER_MAX_CONCURRENT_BATCHES",
      apply: (cfg, v) => {
        cfg.indexer.maxConcurrentBatches = parseInt(v, 10);
      },
    },
    {
      envVar: "PRISM_INDEXER_INCREMENTAL_BY_DEFAULT",
      apply: (cfg, v) => {
        cfg.indexer.incrementalByDefault = v === "true";
      },
    },
    {
      envVar: "PRISM_PURPOSE_ENABLED",
      apply: (cfg, v) => {
        cfg.purpose.enabled = v === "true";
      },
    },
    {
      envVar: "PRISM_PURPOSE_MODEL",
      apply: (cfg, v) => {
        cfg.purpose.model = v;
      },
    },
    {
      envVar: "PRISM_PURPOSE_BUDGET_USD",
      apply: (cfg, v) => {
        cfg.purpose.budgetUsd = parseFloat(v);
      },
    },
    {
      envVar: "PRISM_SEMANTIC_ENABLED",
      apply: (cfg, v) => {
        cfg.semantic.enabled = v === "true";
      },
    },
    {
      envVar: "PRISM_SEMANTIC_MODEL",
      apply: (cfg, v) => {
        cfg.semantic.model = v;
      },
    },
    {
      envVar: "PRISM_SEMANTIC_BUDGET_USD",
      apply: (cfg, v) => {
        cfg.semantic.budgetUsd = parseFloat(v);
      },
    },
    {
      envVar: "PRISM_ANALYSIS_ENABLED",
      apply: (cfg, v) => {
        cfg.analysis.enabled = v === "true";
      },
    },
    {
      envVar: "PRISM_ANALYSIS_MODEL",
      apply: (cfg, v) => {
        cfg.analysis.model = v;
      },
    },
    {
      envVar: "PRISM_ANALYSIS_BUDGET_USD",
      apply: (cfg, v) => {
        cfg.analysis.budgetUsd = parseFloat(v);
      },
    },
    {
      envVar: "PRISM_BLUEPRINT_ENABLED",
      apply: (cfg, v) => {
        cfg.blueprint.enabled = v === "true";
      },
    },
    {
      envVar: "PRISM_BLUEPRINT_MODEL",
      apply: (cfg, v) => {
        cfg.blueprint.model = v;
      },
    },
    {
      envVar: "PRISM_BLUEPRINT_BUDGET_USD",
      apply: (cfg, v) => {
        cfg.blueprint.budgetUsd = parseFloat(v);
      },
    },
    {
      envVar: "PRISM_STRUCTURAL_MAX_FILE_SIZE_BYTES",
      apply: (cfg, v) => {
        cfg.structural.maxFileSizeBytes = parseInt(v, 10);
      },
    },
  ];

  for (const { envVar, apply } of envMap) {
    const value = process.env[envVar];
    if (value !== undefined) {
      logger.debug({ envVar, value }, "Applying env override");
      apply(config, value);
    }
  }

  return config;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Initialise the configuration.
 *
 * Priority (highest wins):
 *   1. `PRISM_*` environment-variable overrides
 *   2. Settings stored in `prism_settings` DB table
 *   3. `prism.config.yaml` (used as a one-time seed if DB row is absent)
 *   4. Built-in defaults
 *
 * The resolved config is cached for subsequent `getConfig()` calls.
 */
export async function initConfig(configPath?: string): Promise<PrismConfig> {
  // Load YAML as fallback seed (used only when DB has no row yet).
  const resolved = configPath ?? resolve(process.cwd(), "prism.config.yaml");
  let fileConfig: Record<string, unknown> = {};
  if (existsSync(resolved)) {
    const raw = readFileSync(resolved, "utf-8");
    const parsed = yaml.load(raw);
    if (parsed && typeof parsed === "object") {
      fileConfig = parsed as Record<string, unknown>;
    }
    logger.debug({ path: resolved }, "Loaded YAML config as seed");
  }

  // Attempt to load from DB; fall back to YAML seed on error or missing row.
  let dbConfig: Record<string, unknown> = {};
  try {
    dbConfig = await getDbSettings();
    if (Object.keys(dbConfig).length === 0 && Object.keys(fileConfig).length > 0) {
      // First run: seed DB from YAML so existing deployments don't lose settings.
      logger.info("No DB settings found — seeding from YAML config");
      await saveDbSettings(fileConfig);
      dbConfig = fileConfig;
    }
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "Could not read settings from DB — using YAML/defaults",
    );
    dbConfig = fileConfig;
  }

  const merged = deepMerge(
    structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>,
    dbConfig,
  ) as unknown as PrismConfig;

  _config = applyEnvOverrides(merged);
  return _config;
}

/**
 * Return the cached configuration.
 *
 * Requires `initConfig()` to have been awaited at startup.
 * Throws if called before initialisation.
 */
export function getConfig(): PrismConfig {
  if (!_config) {
    throw new Error("Config not initialised — call await initConfig() at startup");
  }
  return _config;
}

/**
 * Reset the cached configuration (useful for testing).
 */
export function resetConfig(): void {
  _config = undefined;
}

/**
 * Resolve an API key: prefer value from config, fall back to env var.
 *
 * @param configKey — key name on `ApiKeysConfig`
 * @param envVar    — environment variable name to fall back to
 */
export function getApiKey(configKey: keyof ApiKeysConfig, envVar: string): string | undefined {
  try {
    const cfg = getConfig();
    if (cfg.apiKeys[configKey]) return cfg.apiKeys[configKey];
  } catch {
    // Config not yet initialised — fall through to env var
  }
  return process.env[envVar] || undefined;
}

/**
 * Deep-merge `partial` into the current config, persist to the DB, reset
 * the cache, and return the new config.
 *
 * @param partial — A (possibly nested) subset of PrismConfig to update.
 */
export async function saveConfig(partial: Record<string, unknown>): Promise<PrismConfig> {
  const current = getConfig();
  const updated = deepMerge(
    structuredClone(current) as unknown as Record<string, unknown>,
    partial,
  ) as unknown as PrismConfig;
  await saveDbSettings(updated as unknown as Record<string, unknown>);
  resetConfig();
  return initConfig();
}
