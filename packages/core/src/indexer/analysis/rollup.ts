/**
 * Hierarchical summary rollup for Layer 4.
 *
 * Summarise files from symbol summaries, modules from file summaries,
 * and the whole system from module summaries. Each level calls Claude
 * Sonnet with the lower-level summaries as input.
 *
 * Supports incremental rollup via dirty-flag propagation: only files/modules
 * that changed (or whose input hash changed) get re-summarised.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { logger } from "../../logger.js";
import { createAnthropicClient } from "../../llm/client.js";
import type { BudgetTracker } from "../types.js";
import type { AnalysisConfig } from "../../domain/types.js";
import type { SummaryRow } from "../../db/queries/summaries.js";
import {
  bulkInsertSummaries,
  deleteSummariesByTargets,
} from "../../db/queries/summaries.js";

// ---------------------------------------------------------------------------
// Result types for incremental rollup
// ---------------------------------------------------------------------------

export interface FileRollupResult {
  /** All file-level summaries (reused + freshly generated). */
  results: SummaryRow[];
  /** File paths that actually got a new/updated summary (dirty propagation). */
  dirtyFilePaths: Set<string>;
}

export interface ModuleRollupResult {
  /** All module-level summaries (reused + freshly generated). */
  results: SummaryRow[];
  /** Module paths that actually got a new/updated summary. */
  dirtyModulePaths: Set<string>;
}

export interface SystemRollupResult {
  summary: SummaryRow | null;
  changed: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cost per input token for Claude Sonnet (approximate). */
const SONNET_INPUT_COST_PER_TOKEN = 0.000003; // $3.00 / 1M tokens
/** Cost per output token for Claude Sonnet (approximate). */
const SONNET_OUTPUT_COST_PER_TOKEN = 0.000015; // $15.00 / 1M tokens

// ---------------------------------------------------------------------------
// Prompt loading
// ---------------------------------------------------------------------------

const _templateCache = new Map<string, string>();

/**
 * Load a prompt template from the prompts/ directory.
 */
export function loadTemplate(templateName: string, basePath?: string): string {
  if (_templateCache.has(templateName)) {
    return _templateCache.get(templateName)!;
  }

  const promptPath = basePath
    ? resolve(basePath, `prompts/${templateName}`)
    : resolve(process.cwd(), `prompts/${templateName}`);

  try {
    const content = readFileSync(promptPath, "utf-8");
    _templateCache.set(templateName, content);
    return content;
  } catch {
    logger.warn({ promptPath }, "Prompt template not found, using fallback");
    return "";
  }
}

/**
 * Reset the template cache (for testing).
 */
export function resetTemplateCache(): void {
  _templateCache.clear();
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function computeCost(inputTokens: number, outputTokens: number): number {
  return (
    inputTokens * SONNET_INPUT_COST_PER_TOKEN +
    outputTokens * SONNET_OUTPUT_COST_PER_TOKEN
  );
}

// ---------------------------------------------------------------------------
// File-level rollup
// ---------------------------------------------------------------------------

/**
 * Summarise files by aggregating their symbol-level summaries.
 *
 * When `dirtyFiles` is provided, only files in that set are re-summarised.
 * Clean files reuse their existing summary. An input-hash check provides a
 * secondary safety net even for dirty files — if the prompt hasn't changed,
 * the existing summary is reused.
 */
export async function rollupFileSummaries(
  projectId: number,
  symbolSummaries: SummaryRow[],
  filePathMap: Map<string, { language: string; symbolCount: number }>,
  config: AnalysisConfig,
  budget: BudgetTracker,
  onProgress?: (filesProcessed: number) => void,
  dirtyFiles?: Set<string>,
  existingSummaries?: Map<string, SummaryRow>,
): Promise<FileRollupResult> {
  const client = createAnthropicClient();
  const template = loadTemplate("summarize-file.md");

  // Group symbol summaries by file path
  const byFile = new Map<string, SummaryRow[]>();
  for (const summary of symbolSummaries) {
    // targetId format: "filePath:symbolName:symbolKind"
    const parts = summary.targetId.split(":");
    const filePath = parts.slice(0, -2).join(":");
    if (!filePath) continue;

    const existing = byFile.get(filePath) ?? [];
    existing.push(summary);
    byFile.set(filePath, existing);
  }

  const results: SummaryRow[] = [];
  const dirtyFilePaths = new Set<string>();
  let processedCount = 0;

  for (const [filePath, fileFnSummaries] of byFile) {
    if (budget.exceeded) {
      logger.warn("Budget exceeded — stopping file rollup");
      break;
    }

    const targetId = `file:${filePath}`;
    const existingRow = existingSummaries?.get(targetId);

    // Skip clean files — if dirtyFiles is defined and this file isn't in it,
    // AND we have an existing summary, just reuse it.
    if (dirtyFiles !== undefined && !dirtyFiles.has(filePath) && existingRow) {
      results.push(existingRow);
      processedCount++;
      onProgress?.(processedCount);
      logger.debug({ filePath }, "Reusing existing file summary (clean file)");
      continue;
    }

    const fileInfo = filePathMap.get(filePath) ?? { language: "unknown", symbolCount: fileFnSummaries.length };

    const symbolSummariesText = fileFnSummaries
      .map((s) => `- ${s.targetId}: ${s.content}`)
      .join("\n");

    let prompt = template
      .replace(/\{\{filePath\}\}/g, filePath)
      .replace(/\{\{language\}\}/g, fileInfo.language)
      .replace(/\{\{symbolCount\}\}/g, String(fileInfo.symbolCount))
      .replace(/\{\{symbolSummaries\}\}/g, symbolSummariesText);

    // If no template loaded, use fallback
    if (!prompt.trim()) {
      prompt = `Summarise the following file based on its symbol summaries:\n\nFile: ${filePath}\n\n${symbolSummariesText}`;
    }

    // Input hash safety net — if the prompt is identical, skip the LLM call
    const inputHash = createHash("sha256").update(prompt).digest("hex");
    if (existingRow?.inputHash === inputHash) {
      results.push(existingRow);
      processedCount++;
      onProgress?.(processedCount);
      logger.debug({ filePath }, "Reusing existing file summary (hash match)");
      continue;
    }

    try {
      // Delete old summary before inserting new one
      await deleteSummariesByTargets(projectId, "file", [targetId]);

      const response = await client.messages.create({
        model: config.model,
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      const content = textBlock && "text" in textBlock ? textBlock.text : "";
      const costUsd = computeCost(
        response.usage.input_tokens,
        response.usage.output_tokens,
      );
      budget.record(costUsd);

      const inserted = await bulkInsertSummaries([{
        projectId,
        level: "file",
        targetId,
        content,
        model: config.model,
        inputHash,
        costUsd: costUsd.toFixed(4),
      }]);

      results.push(...inserted);
      dirtyFilePaths.add(filePath);
      processedCount++;
      onProgress?.(processedCount);

      logger.debug(
        { filePath, costUsd: costUsd.toFixed(4) },
        "File summary generated",
      );
    } catch (err) {
      logger.error(
        { filePath, error: err instanceof Error ? err.message : String(err) },
        "Failed to generate file summary",
      );
    }
  }

  return { results, dirtyFilePaths };
}

// ---------------------------------------------------------------------------
// Module-level rollup
// ---------------------------------------------------------------------------

/**
 * Summarise modules (directories) by aggregating file-level summaries.
 *
 * When `dirtyModules` is provided, only modules in that set are re-summarised.
 */
export async function rollupModuleSummaries(
  projectId: number,
  fileSummaries: SummaryRow[],
  config: AnalysisConfig,
  budget: BudgetTracker,
  dirtyModules?: Set<string>,
  existingSummaries?: Map<string, SummaryRow>,
): Promise<ModuleRollupResult> {
  const client = createAnthropicClient();
  const template = loadTemplate("summarize-module.md");

  // Group file summaries by directory (module)
  const byModule = new Map<string, SummaryRow[]>();
  for (const summary of fileSummaries) {
    // targetId format: "file:path/to/file.ts"
    const filePath = summary.targetId.replace(/^file:/, "");
    const modulePath = dirname(filePath);
    if (modulePath === ".") continue;

    const existing = byModule.get(modulePath) ?? [];
    existing.push(summary);
    byModule.set(modulePath, existing);
  }

  const results: SummaryRow[] = [];
  const dirtyModulePaths = new Set<string>();

  for (const [modulePath, modFileSummaries] of byModule) {
    if (budget.exceeded) {
      logger.warn("Budget exceeded — stopping module rollup");
      break;
    }

    const targetId = `module:${modulePath}`;
    const existingRow = existingSummaries?.get(targetId);

    // Skip clean modules
    if (dirtyModules !== undefined && !dirtyModules.has(modulePath) && existingRow) {
      results.push(existingRow);
      logger.debug({ modulePath }, "Reusing existing module summary (clean module)");
      continue;
    }

    const fileSummariesText = modFileSummaries
      .map((s) => `- ${s.targetId}: ${s.content}`)
      .join("\n");

    let prompt = template
      .replace(/\{\{modulePath\}\}/g, modulePath)
      .replace(/\{\{fileCount\}\}/g, String(modFileSummaries.length))
      .replace(/\{\{fileSummaries\}\}/g, fileSummariesText);

    if (!prompt.trim()) {
      prompt = `Summarise the following module based on its file summaries:\n\nModule: ${modulePath}\n\n${fileSummariesText}`;
    }

    // Input hash safety net
    const inputHash = createHash("sha256").update(prompt).digest("hex");
    if (existingRow?.inputHash === inputHash) {
      results.push(existingRow);
      logger.debug({ modulePath }, "Reusing existing module summary (hash match)");
      continue;
    }

    try {
      // Delete old summary before inserting new one
      await deleteSummariesByTargets(projectId, "module", [targetId]);

      const response = await client.messages.create({
        model: config.model,
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      const content = textBlock && "text" in textBlock ? textBlock.text : "";
      const costUsd = computeCost(
        response.usage.input_tokens,
        response.usage.output_tokens,
      );
      budget.record(costUsd);

      const inserted = await bulkInsertSummaries([{
        projectId,
        level: "module",
        targetId,
        content,
        model: config.model,
        inputHash,
        costUsd: costUsd.toFixed(4),
      }]);

      results.push(...inserted);
      dirtyModulePaths.add(modulePath);

      logger.debug(
        { modulePath, costUsd: costUsd.toFixed(4) },
        "Module summary generated",
      );
    } catch (err) {
      logger.error(
        { modulePath, error: err instanceof Error ? err.message : String(err) },
        "Failed to generate module summary",
      );
    }
  }

  return { results, dirtyModulePaths };
}

// ---------------------------------------------------------------------------
// System-level rollup
// ---------------------------------------------------------------------------

/**
 * Summarise the entire system by aggregating module-level summaries.
 *
 * When `forceRegenerate` is false and an existing summary exists, it is reused.
 */
export async function rollupSystemSummary(
  projectId: number,
  projectName: string,
  moduleSummaries: SummaryRow[],
  config: AnalysisConfig,
  budget: BudgetTracker,
  forceRegenerate?: boolean,
  existingSummary?: SummaryRow,
): Promise<SystemRollupResult> {
  if (budget.exceeded) {
    logger.warn("Budget exceeded — skipping system summary");
    return { summary: existingSummary ?? null, changed: false };
  }

  // If not forced and we have an existing summary, reuse it
  if (!forceRegenerate && existingSummary) {
    logger.info({ projectName }, "Reusing existing system summary (no dirty modules)");
    return { summary: existingSummary, changed: false };
  }

  const client = createAnthropicClient();
  const template = loadTemplate("summarize-system.md");

  const moduleSummariesText = moduleSummaries
    .map((s) => `- ${s.targetId}: ${s.content}`)
    .join("\n");

  let prompt = template
    .replace(/\{\{projectName\}\}/g, projectName)
    .replace(/\{\{moduleCount\}\}/g, String(moduleSummaries.length))
    .replace(/\{\{moduleSummaries\}\}/g, moduleSummariesText);

  if (!prompt.trim()) {
    prompt = `Summarise the following system based on its module summaries:\n\nProject: ${projectName}\n\n${moduleSummariesText}`;
  }

  // Input hash safety net
  const inputHash = createHash("sha256").update(prompt).digest("hex");
  if (existingSummary?.inputHash === inputHash) {
    logger.info({ projectName }, "Reusing existing system summary (hash match)");
    return { summary: existingSummary, changed: false };
  }

  try {
    const targetId = `system:${projectName}`;
    await deleteSummariesByTargets(projectId, "system", [targetId]);

    const response = await client.messages.create({
      model: config.model,
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const content = textBlock && "text" in textBlock ? textBlock.text : "";
    const costUsd = computeCost(
      response.usage.input_tokens,
      response.usage.output_tokens,
    );
    budget.record(costUsd);

    const inserted = await bulkInsertSummaries([{
      projectId,
      level: "system",
      targetId,
      content,
      model: config.model,
      inputHash,
      costUsd: costUsd.toFixed(4),
    }]);

    logger.info(
      { projectName, costUsd: costUsd.toFixed(4) },
      "System summary generated",
    );

    return { summary: inserted[0] ?? null, changed: true };
  } catch (err) {
    logger.error(
      { projectName, error: err instanceof Error ? err.message : String(err) },
      "Failed to generate system summary",
    );
    return { summary: existingSummary ?? null, changed: false };
  }
}
