/**
 * Purpose analysis — synthesise a structured App Purpose Document.
 *
 * Uses Claude Sonnet to produce a rich understanding of why the application
 * exists, who uses it, and what must be preserved or improved in a redesign.
 * The result is stored as a `prism_summaries` row with level="purpose".
 */

import { createHash } from "node:crypto";
import { logger } from "../../logger.js";
import { createAnthropicClient } from "../../llm/client.js";
import type { BudgetTracker } from "../types.js";
import type { PurposeConfig } from "../../domain/types.js";
import { bulkInsertSummaries, getSummaryByTargetId } from "../../db/queries/summaries.js";
import { loadTemplate } from "../analysis/rollup.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SONNET_INPUT_COST_PER_TOKEN = 0.000003; // $3.00 / 1M tokens
const SONNET_OUTPUT_COST_PER_TOKEN = 0.000015; // $15.00 / 1M tokens

const TARGET_ID = "project:purpose";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run purpose analysis: synthesise an App Purpose Document from available
 * project signals using Claude Sonnet.
 *
 * Writes a row to `prism_summaries` with `level="purpose"` and
 * `targetId="project:purpose"`. Skips the LLM call if inputs are unchanged
 * (staleness check via SHA-256 hash).
 *
 * @param projectId        — The project ID.
 * @param projectName      — The project name.
 * @param intentText       — Assembled documentation intent text.
 * @param schemaSnippets   — Concatenated schema/migration file snippets.
 * @param routeSnippets    — Concatenated route/controller file snippets.
 * @param exportedTypeNames — Exported class/interface/type names.
 * @param testDescriptions — describe/it/test string literals from test files.
 * @param config           — Purpose layer configuration.
 * @param budget           — Budget tracker.
 * @returns `{ content, costUsd }` — the document and its cost.
 */
export async function runPurposeAnalysis(
  projectId: number,
  projectName: string,
  intentText: string,
  schemaSnippets: string,
  routeSnippets: string,
  exportedTypeNames: string[],
  testDescriptions: string[],
  config: PurposeConfig,
  budget: BudgetTracker,
): Promise<{ content: string; costUsd: number }> {
  if (budget.exceeded) {
    logger.warn("Budget exceeded — skipping purpose analysis");
    return { content: "", costUsd: 0 };
  }

  // Staleness check — hash the inputs
  const inputHash = createHash("sha256")
    .update(intentText)
    .update(schemaSnippets)
    .update(routeSnippets)
    .digest("hex");

  const existing = await getSummaryByTargetId(projectId, TARGET_ID);
  if (existing && existing.inputHash === inputHash) {
    logger.info(
      { projectId, targetId: TARGET_ID },
      "Purpose analysis inputs unchanged — skipping LLM call",
    );
    return { content: existing.content, costUsd: 0 };
  }

  const exportedTypesText =
    exportedTypeNames.length > 0
      ? exportedTypeNames.join(", ")
      : "(none detected)";

  const testDescriptionsText =
    testDescriptions.length > 0
      ? testDescriptions.map((d) => `- ${d}`).join("\n")
      : "(none detected)";

  const template = loadTemplate("app-purpose.md");
  const prompt = template
    .replace(/\{\{projectName\}\}/g, projectName)
    .replace(/\{\{docIntent\}\}/g, intentText || "(no documentation found)")
    .replace(/\{\{schemaContent\}\}/g, schemaSnippets || "(no schema files found)")
    .replace(/\{\{routeContent\}\}/g, routeSnippets || "(no route files found)")
    .replace(/\{\{exportedTypes\}\}/g, exportedTypesText)
    .replace(/\{\{testDescriptions\}\}/g, testDescriptionsText);

  const client = createAnthropicClient();

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const content = textBlock && "text" in textBlock ? textBlock.text.trim() : "";

    const costUsd =
      response.usage.input_tokens * SONNET_INPUT_COST_PER_TOKEN +
      response.usage.output_tokens * SONNET_OUTPUT_COST_PER_TOKEN;
    budget.record(costUsd);

    // Upsert into prism_summaries
    // Delete old row if it exists, then insert fresh
    await bulkInsertSummaries([
      {
        projectId,
        level: "purpose",
        targetId: TARGET_ID,
        content,
        model: config.model,
        inputHash,
        costUsd: costUsd.toFixed(4),
      },
    ]);

    logger.info(
      { projectId, costUsd: costUsd.toFixed(4), contentLength: content.length },
      "Purpose analysis complete",
    );

    return { content, costUsd };
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "Failed to run purpose analysis",
    );
    return { content: "", costUsd: 0 };
  }
}
