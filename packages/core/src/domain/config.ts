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

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { logger } from "../logger.js";
import type { PrismConfig } from "./types.js";

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
    model: "claude-sonnet-4-6-20250514",
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
    model: "claude-sonnet-4-6-20250514",
    budgetUsd: 5.0,
  },
  blueprint: {
    enabled: true,
    model: "claude-sonnet-4-6-20250514",
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
 * Initialise the configuration from a YAML file.
 *
 * @param configPath — path to the YAML config file (default: `prism.config.yaml`
 *   in the current working directory).
 *
 * The function:
 * 1. Reads the YAML file (if it exists).
 * 2. Deep-merges with defaults.
 * 3. Applies `PRISM_*` environment-variable overrides.
 * 4. Caches the result for subsequent `getConfig()` calls.
 */
export function initConfig(configPath?: string): PrismConfig {
  const resolved = configPath ?? resolve(process.cwd(), "prism.config.yaml");

  let fileConfig: Record<string, unknown> = {};

  if (existsSync(resolved)) {
    const raw = readFileSync(resolved, "utf-8");
    const parsed = yaml.load(raw);
    if (parsed && typeof parsed === "object") {
      fileConfig = parsed as Record<string, unknown>;
    }
    logger.info({ path: resolved }, "Loaded config from YAML");
  } else {
    logger.info({ path: resolved }, "Config file not found, using defaults");
  }

  const merged = deepMerge(
    structuredClone(DEFAULT_CONFIG) as unknown as Record<string, unknown>,
    fileConfig,
  ) as unknown as PrismConfig;

  _config = applyEnvOverrides(merged);
  return _config;
}

/**
 * Return the cached configuration.
 *
 * Lazily calls `initConfig()` on first access.
 */
export function getConfig(): PrismConfig {
  if (!_config) {
    return initConfig();
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
 * Deep-merge `partial` into the current config, write the result back to
 * `prism.config.yaml`, reset the cache, and return the new config.
 *
 * @param partial — A (possibly nested) subset of PrismConfig to update.
 */
export function saveConfig(partial: Record<string, unknown>): PrismConfig {
  const current = getConfig();
  const updated = deepMerge(
    structuredClone(current) as unknown as Record<string, unknown>,
    partial,
  ) as unknown as PrismConfig;
  writeFileSync(
    resolve(process.cwd(), "prism.config.yaml"),
    yaml.dump(updated),
    "utf-8",
  );
  resetConfig();
  return initConfig();
}
