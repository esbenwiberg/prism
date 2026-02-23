/**
 * Hierarchical summary rollup for Layer 4.
 *
 * Summarise files from symbol summaries, modules from file summaries,
 * and the whole system from module summaries. Each level calls Claude
 * Sonnet with the lower-level summaries as input.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

import { logger } from "../../logger.js";
import type { BudgetTracker } from "../types.js";
import type { AnalysisConfig } from "../../domain/types.js";
import type { SummaryRow } from "../../db/queries/summaries.js";
import { bulkInsertSummaries } from "../../db/queries/summaries.js";

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
 * Groups function-level summaries by file, then calls Claude Sonnet
 * to produce a file-level summary for each file.
 *
 * @param projectId       — The project ID.
 * @param symbolSummaries — All function-level summaries for the project.
 * @param filePathMap     — Map from targetId prefix (filePath) to language.
 * @param config          — Analysis configuration.
 * @param budget          — Budget tracker.
 * @returns The new file-level summary rows inserted.
 */
export async function rollupFileSummaries(
  projectId: number,
  symbolSummaries: SummaryRow[],
  filePathMap: Map<string, { language: string; symbolCount: number }>,
  config: AnalysisConfig,
  budget: BudgetTracker,
  onProgress?: (filesProcessed: number) => void,
): Promise<SummaryRow[]> {
  const client = new Anthropic();
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

  for (const [filePath, summaries] of byFile) {
    if (budget.exceeded) {
      logger.warn("Budget exceeded — stopping file rollup");
      break;
    }

    const fileInfo = filePathMap.get(filePath) ?? { language: "unknown", symbolCount: summaries.length };

    const symbolSummariesText = summaries
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

    try {
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

      const inputHash = createHash("sha256").update(prompt).digest("hex");

      const inserted = await bulkInsertSummaries([{
        projectId,
        level: "file",
        targetId: `file:${filePath}`,
        content,
        model: config.model,
        inputHash,
        costUsd: costUsd.toFixed(4),
      }]);

      results.push(...inserted);
      onProgress?.(results.length);

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

  return results;
}

// ---------------------------------------------------------------------------
// Module-level rollup
// ---------------------------------------------------------------------------

/**
 * Summarise modules (directories) by aggregating file-level summaries.
 *
 * Groups file summaries by their parent directory, then calls Claude
 * Sonnet to produce a module-level summary.
 */
export async function rollupModuleSummaries(
  projectId: number,
  fileSummaries: SummaryRow[],
  config: AnalysisConfig,
  budget: BudgetTracker,
): Promise<SummaryRow[]> {
  const client = new Anthropic();
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

  for (const [modulePath, summaries] of byModule) {
    if (budget.exceeded) {
      logger.warn("Budget exceeded — stopping module rollup");
      break;
    }

    const fileSummariesText = summaries
      .map((s) => `- ${s.targetId}: ${s.content}`)
      .join("\n");

    let prompt = template
      .replace(/\{\{modulePath\}\}/g, modulePath)
      .replace(/\{\{fileCount\}\}/g, String(summaries.length))
      .replace(/\{\{fileSummaries\}\}/g, fileSummariesText);

    if (!prompt.trim()) {
      prompt = `Summarise the following module based on its file summaries:\n\nModule: ${modulePath}\n\n${fileSummariesText}`;
    }

    try {
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

      const inputHash = createHash("sha256").update(prompt).digest("hex");

      const inserted = await bulkInsertSummaries([{
        projectId,
        level: "module",
        targetId: `module:${modulePath}`,
        content,
        model: config.model,
        inputHash,
        costUsd: costUsd.toFixed(4),
      }]);

      results.push(...inserted);

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

  return results;
}

// ---------------------------------------------------------------------------
// System-level rollup
// ---------------------------------------------------------------------------

/**
 * Summarise the entire system by aggregating module-level summaries.
 */
export async function rollupSystemSummary(
  projectId: number,
  projectName: string,
  moduleSummaries: SummaryRow[],
  config: AnalysisConfig,
  budget: BudgetTracker,
): Promise<SummaryRow | null> {
  if (budget.exceeded) {
    logger.warn("Budget exceeded — skipping system summary");
    return null;
  }

  const client = new Anthropic();
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

  try {
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

    const inputHash = createHash("sha256").update(prompt).digest("hex");

    const inserted = await bulkInsertSummaries([{
      projectId,
      level: "system",
      targetId: `system:${projectName}`,
      content,
      model: config.model,
      inputHash,
      costUsd: costUsd.toFixed(4),
    }]);

    logger.info(
      { projectName, costUsd: costUsd.toFixed(4) },
      "System summary generated",
    );

    return inserted[0] ?? null;
  } catch (err) {
    logger.error(
      { projectName, error: err instanceof Error ? err.message : String(err) },
      "Failed to generate system summary",
    );
    return null;
  }
}
