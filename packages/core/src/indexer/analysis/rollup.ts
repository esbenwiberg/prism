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

/** Cost per input token for Claude Haiku (approximate). */
const HAIKU_INPUT_COST_PER_TOKEN = 0.0000008; // $0.80 / 1M tokens
/** Cost per output token for Claude Haiku (approximate). */
const HAIKU_OUTPUT_COST_PER_TOKEN = 0.000004; // $4.00 / 1M tokens

/** Default model for file-level rollup (Haiku — simple aggregation). */
const DEFAULT_FILE_ROLLUP_MODEL = "claude-haiku-4-5-20251001";
/** Default model for module-level rollup (Haiku — moderate reasoning). */
const DEFAULT_MODULE_ROLLUP_MODEL = "claude-haiku-4-5-20251001";

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

function computeCost(inputTokens: number, outputTokens: number, model?: string): number {
  const isHaiku = model?.includes("haiku");
  const inputCost = isHaiku ? HAIKU_INPUT_COST_PER_TOKEN : SONNET_INPUT_COST_PER_TOKEN;
  const outputCost = isHaiku ? HAIKU_OUTPUT_COST_PER_TOKEN : SONNET_OUTPUT_COST_PER_TOKEN;
  return inputTokens * inputCost + outputTokens * outputCost;
}

// ---------------------------------------------------------------------------
// Summary delta detection
// ---------------------------------------------------------------------------

/** Max batch size for batched file rollups (files per LLM call). */
const MAX_BATCH_FILES = 10;
/** Max combined input tokens for a batch (rough estimate: 4 chars/token). */
const MAX_BATCH_CHARS = 16000; // ~4000 tokens
/** Threshold for trivial delta — skip rollup if fewer than this % of summaries changed. */
const TRIVIAL_DELTA_THRESHOLD = 0.1;

/**
 * Compute the summary delta score for a file: what fraction of its function
 * summaries actually changed content?
 *
 * Returns a number 0-1 where 0 means nothing changed and 1 means everything changed.
 */
export function computeSummaryDelta(
  filePath: string,
  currentSummaries: SummaryRow[],
  previousSummaries: Map<string, SummaryRow>,
): number {
  if (currentSummaries.length === 0) return 1; // New file, always dirty

  let changedCount = 0;
  for (const summary of currentSummaries) {
    const prev = previousSummaries.get(summary.targetId);
    if (!prev) {
      changedCount++; // New symbol
      continue;
    }
    if (prev.inputHash !== summary.inputHash) {
      // Content actually changed — check if it's a trivial edit
      const editDistance = computeEditRatio(prev.content, summary.content);
      if (editDistance > 0.15) {
        changedCount++;
      }
    }
  }

  return currentSummaries.length > 0 ? changedCount / currentSummaries.length : 1;
}

/**
 * Compute the ratio of character changes between two strings.
 * Uses a cheap length-based heuristic rather than full edit distance.
 */
function computeEditRatio(a: string, b: string): number {
  if (a === b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  // Quick heuristic: length difference + sampling character changes
  const lenDiff = Math.abs(a.length - b.length);
  const minLen = Math.min(a.length, b.length);
  let charDiffs = 0;
  const step = Math.max(1, Math.floor(minLen / 50)); // Sample ~50 positions
  for (let i = 0; i < minLen; i += step) {
    if (a[i] !== b[i]) charDiffs++;
  }
  const sampledDiffRate = minLen > 0 ? charDiffs / Math.ceil(minLen / step) : 0;
  return Math.min(1, (lenDiff / maxLen) + sampledDiffRate);
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
 *
 * Optimisations:
 * - **Delta detection**: skips rollup if < 10% of function summaries changed
 * - **Batching**: groups small files (< 5 symbols) into single LLM calls
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
  // Tiered model: file rollup uses Haiku by default (simple aggregation, ~10x cheaper)
  const fileModel = config.fileRollupModel ?? DEFAULT_FILE_ROLLUP_MODEL;

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

  // Phase 1: Classify files — skip clean files and trivial deltas
  interface PendingFile {
    filePath: string;
    fnSummaries: SummaryRow[];
    prompt: string;
    inputHash: string;
    targetId: string;
  }
  const pendingFiles: PendingFile[] = [];

  for (const [filePath, fileFnSummaries] of byFile) {
    const targetId = `file:${filePath}`;
    const existingRow = existingSummaries?.get(targetId);

    // Skip clean files
    if (dirtyFiles !== undefined && !dirtyFiles.has(filePath) && existingRow) {
      results.push(existingRow);
      processedCount++;
      onProgress?.(processedCount);
      logger.debug({ filePath }, "Reusing existing file summary (clean file)");
      continue;
    }

    // Delta detection: skip if < 10% of function summaries changed meaningfully
    if (existingRow && existingSummaries) {
      const delta = computeSummaryDelta(filePath, fileFnSummaries, existingSummaries);
      if (delta < TRIVIAL_DELTA_THRESHOLD) {
        results.push(existingRow);
        processedCount++;
        onProgress?.(processedCount);
        logger.debug({ filePath, delta: delta.toFixed(2) }, "Skipping file rollup (trivial delta)");
        continue;
      }
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

    if (!prompt.trim()) {
      prompt = `Summarise the following file based on its symbol summaries:\n\nFile: ${filePath}\n\n${symbolSummariesText}`;
    }

    const inputHash = createHash("sha256").update(prompt).digest("hex");
    if (existingRow?.inputHash === inputHash) {
      results.push(existingRow);
      processedCount++;
      onProgress?.(processedCount);
      logger.debug({ filePath }, "Reusing existing file summary (hash match)");
      continue;
    }

    pendingFiles.push({ filePath, fnSummaries: fileFnSummaries, prompt, inputHash, targetId });
  }

  // Phase 2: Separate small files (batchable) from large files
  const smallFiles = pendingFiles.filter((f) => f.fnSummaries.length < 5);
  const largeFiles = pendingFiles.filter((f) => f.fnSummaries.length >= 5);

  // Phase 3: Batch small files into combined LLM calls
  const batches: PendingFile[][] = [];
  let currentBatch: PendingFile[] = [];
  let currentBatchChars = 0;

  for (const file of smallFiles) {
    const fileChars = file.prompt.length;
    if (
      currentBatch.length >= MAX_BATCH_FILES ||
      (currentBatchChars + fileChars > MAX_BATCH_CHARS && currentBatch.length > 0)
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentBatchChars = 0;
    }
    currentBatch.push(file);
    currentBatchChars += fileChars;
  }
  if (currentBatch.length > 0) batches.push(currentBatch);

  // Process batched small files
  for (const batch of batches) {
    if (budget.exceeded) {
      logger.warn("Budget exceeded — stopping file rollup");
      break;
    }

    if (batch.length === 1) {
      // Single file — process normally (no batching overhead)
      const file = batch[0];
      const result = await rollupSingleFile(client, projectId, file, fileModel, budget);
      if (result) {
        results.push(result);
        dirtyFilePaths.add(file.filePath);
      }
      processedCount++;
      onProgress?.(processedCount);
    } else {
      // Multi-file batch — combine into one prompt
      const batchPrompt = batch
        .map((f, i) => `--- FILE ${i + 1}: ${f.filePath} ---\n${f.prompt}`)
        .join("\n\n");

      const combinedPrompt = `Summarise each of the following files separately. For each file, write the file path on its own line followed by the summary.\n\n${batchPrompt}`;

      try {
        const targetIds = batch.map((f) => f.targetId);
        await deleteSummariesByTargets(projectId, "file", targetIds);

        const response = await client.messages.create({
          model: fileModel,
          max_tokens: 500 * batch.length,
          messages: [{ role: "user", content: combinedPrompt }],
        });

        const textBlock = response.content.find((block) => block.type === "text");
        const responseText = textBlock && "text" in textBlock ? textBlock.text : "";
        const costUsd = computeCost(
          response.usage.input_tokens,
          response.usage.output_tokens,
          fileModel,
        );
        budget.record(costUsd);

        // Parse batch response — split by file markers or file paths
        const perFileCost = costUsd / batch.length;
        const fileSummaries = parseBatchResponse(responseText, batch);

        for (let i = 0; i < batch.length; i++) {
          const file = batch[i];
          const content = fileSummaries[i] ?? responseText; // Fallback: use full response

          const inserted = await bulkInsertSummaries([{
            projectId,
            level: "file",
            targetId: file.targetId,
            content,
            model: fileModel,
            inputHash: file.inputHash,
            costUsd: perFileCost.toFixed(4),
            qualityScore: null,
            demoted: false,
          }]);

          results.push(...inserted);
          dirtyFilePaths.add(file.filePath);
          processedCount++;
          onProgress?.(processedCount);
        }

        logger.debug(
          { batchSize: batch.length, costUsd: costUsd.toFixed(4) },
          "Batch file rollup complete",
        );
      } catch (err) {
        logger.error(
          { batchSize: batch.length, error: err instanceof Error ? err.message : String(err) },
          "Failed batch file rollup — falling back to individual",
        );
        // Fallback: process individually
        for (const file of batch) {
          const result = await rollupSingleFile(client, projectId, file, fileModel, budget);
          if (result) {
            results.push(result);
            dirtyFilePaths.add(file.filePath);
          }
          processedCount++;
          onProgress?.(processedCount);
        }
      }
    }
  }

  // Phase 4: Process large files individually
  for (const file of largeFiles) {
    if (budget.exceeded) {
      logger.warn("Budget exceeded — stopping file rollup");
      break;
    }

    const result = await rollupSingleFile(client, projectId, file, fileModel, budget);
    if (result) {
      results.push(result);
      dirtyFilePaths.add(file.filePath);
    }
    processedCount++;
    onProgress?.(processedCount);
  }

  return { results, dirtyFilePaths };
}

/** Process a single file rollup via LLM. */
async function rollupSingleFile(
  client: ReturnType<typeof createAnthropicClient>,
  projectId: number,
  file: { filePath: string; prompt: string; inputHash: string; targetId: string },
  model: string,
  budget: BudgetTracker,
): Promise<SummaryRow | null> {
  try {
    await deleteSummariesByTargets(projectId, "file", [file.targetId]);

    const response = await client.messages.create({
      model,
      max_tokens: 500,
      messages: [{ role: "user", content: file.prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const content = textBlock && "text" in textBlock ? textBlock.text : "";
    const costUsd = computeCost(
      response.usage.input_tokens,
      response.usage.output_tokens,
      model,
    );
    budget.record(costUsd);

    const inserted = await bulkInsertSummaries([{
      projectId,
      level: "file",
      targetId: file.targetId,
      content,
      model,
      inputHash: file.inputHash,
      costUsd: costUsd.toFixed(4),
      qualityScore: null,
      demoted: false,
    }]);

    logger.debug(
      { filePath: file.filePath, costUsd: costUsd.toFixed(4) },
      "File summary generated",
    );

    return inserted[0] ?? null;
  } catch (err) {
    logger.error(
      { filePath: file.filePath, error: err instanceof Error ? err.message : String(err) },
      "Failed to generate file summary",
    );
    return null;
  }
}

/**
 * Parse a batched LLM response into per-file summaries.
 *
 * Looks for file path markers in the response to split it.
 */
function parseBatchResponse(
  responseText: string,
  batch: Array<{ filePath: string }>,
): string[] {
  const summaries: string[] = [];

  for (let i = 0; i < batch.length; i++) {
    const currentPath = batch[i].filePath;
    const nextPath = batch[i + 1]?.filePath;

    // Find this file's section in the response
    const startIdx = responseText.indexOf(currentPath);
    if (startIdx === -1) {
      summaries.push(""); // File not found in response
      continue;
    }

    const contentStart = responseText.indexOf("\n", startIdx);
    if (contentStart === -1) {
      summaries.push("");
      continue;
    }

    let endIdx: number;
    if (nextPath) {
      const nextIdx = responseText.indexOf(nextPath, contentStart);
      // Walk back to find the start of the next file's line
      endIdx = nextIdx !== -1
        ? responseText.lastIndexOf("\n", nextIdx)
        : responseText.length;
    } else {
      endIdx = responseText.length;
    }

    summaries.push(responseText.slice(contentStart + 1, endIdx).trim());
  }

  return summaries;
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
  // Tiered model: module rollup uses Haiku by default (moderate reasoning)
  const moduleModel = config.moduleRollupModel ?? DEFAULT_MODULE_ROLLUP_MODEL;

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
        model: moduleModel,
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find((block) => block.type === "text");
      const content = textBlock && "text" in textBlock ? textBlock.text : "";
      const costUsd = computeCost(
        response.usage.input_tokens,
        response.usage.output_tokens,
        moduleModel,
      );
      budget.record(costUsd);

      const inserted = await bulkInsertSummaries([{
        projectId,
        level: "module",
        targetId,
        content,
        model: moduleModel,
        inputHash,
        costUsd: costUsd.toFixed(4),
        qualityScore: null,
        demoted: false,
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
      config.model,
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
      qualityScore: null,
      demoted: false,
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
