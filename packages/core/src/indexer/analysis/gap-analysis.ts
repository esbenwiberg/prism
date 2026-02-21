/**
 * Gap analysis — compare documentation intent with code reality.
 *
 * Uses Claude Sonnet to compare what the documentation says the codebase
 * does vs. what the code actually does, identifying discrepancies.
 */

import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";

import { logger } from "../../logger.js";
import type { BudgetTracker } from "../types.js";
import type { AnalysisConfig } from "../../domain/types.js";
import type { SummaryRow } from "../../db/queries/summaries.js";
import { bulkInsertFindings } from "../../db/queries/findings.js";
import { loadTemplate } from "./rollup.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SONNET_INPUT_COST_PER_TOKEN = 0.000003;
const SONNET_OUTPUT_COST_PER_TOKEN = 0.000015;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A gap finding produced by the analysis. */
export interface GapFinding {
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  category: "gap";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run gap analysis: compare doc intent vs code reality.
 *
 * @param projectId        — The project ID.
 * @param projectName      — The project name.
 * @param docIntent        — Assembled documentation intent text.
 * @param systemSummary    — The system-level summary.
 * @param moduleSummaries  — Module-level summaries.
 * @param config           — Analysis configuration.
 * @param budget           — Budget tracker.
 * @returns Array of gap findings.
 */
export async function runGapAnalysis(
  projectId: number,
  projectName: string,
  docIntent: string,
  systemSummary: string,
  moduleSummaries: SummaryRow[],
  config: AnalysisConfig,
  budget: BudgetTracker,
): Promise<GapFinding[]> {
  if (budget.exceeded) {
    logger.warn("Budget exceeded — skipping gap analysis");
    return [];
  }

  if (!docIntent || !systemSummary) {
    logger.info("Insufficient data for gap analysis — skipping");
    return [];
  }

  const client = new Anthropic();
  const template = loadTemplate("gap-analysis.md");

  const moduleSummariesText = moduleSummaries
    .map((s) => `- ${s.targetId}: ${s.content}`)
    .join("\n");

  let prompt = template
    .replace(/\{\{projectName\}\}/g, projectName)
    .replace(/\{\{docIntent\}\}/g, docIntent)
    .replace(/\{\{systemSummary\}\}/g, systemSummary)
    .replace(/\{\{moduleSummaries\}\}/g, moduleSummariesText);

  if (!prompt.trim()) {
    prompt = [
      `Compare the documentation intent with the code reality for project "${projectName}".`,
      "",
      "Documentation intent:",
      docIntent,
      "",
      "System summary (from code analysis):",
      systemSummary,
      "",
      "Module summaries:",
      moduleSummariesText,
      "",
      "Identify discrepancies as a JSON array of objects with title, description, severity, and category fields.",
    ].join("\n");
  }

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "[]";

    const costUsd =
      response.usage.input_tokens * SONNET_INPUT_COST_PER_TOKEN +
      response.usage.output_tokens * SONNET_OUTPUT_COST_PER_TOKEN;
    budget.record(costUsd);

    // Parse the JSON response
    const gaps = parseGapFindings(rawText);

    // Persist gap findings to the DB
    if (gaps.length > 0) {
      await bulkInsertFindings(
        gaps.map((g) => ({
          projectId,
          category: "gap" as const,
          severity: g.severity,
          title: g.title,
          description: g.description,
          evidence: { source: "gap-analysis", model: config.model },
          suggestion: null,
        })),
      );
    }

    logger.info(
      { projectId, gapCount: gaps.length, costUsd: costUsd.toFixed(4) },
      "Gap analysis complete",
    );

    return gaps;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "Failed to run gap analysis",
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the LLM response into typed GapFinding objects.
 *
 * Handles cases where the LLM wraps the JSON in markdown code fences.
 */
export function parseGapFindings(rawText: string): GapFinding[] {
  let text = rawText.trim();

  // Strip markdown code fences if present
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (item: unknown): item is Record<string, unknown> =>
          item !== null && typeof item === "object",
      )
      .map((item) => ({
        title: typeof item.title === "string" ? item.title : "Unknown gap",
        description:
          typeof item.description === "string" ? item.description : "",
        severity: isValidSeverity(item.severity) ? item.severity : "low",
        category: "gap" as const,
      }));
  } catch {
    logger.warn("Failed to parse gap analysis response as JSON");
    return [];
  }
}

function isValidSeverity(
  value: unknown,
): value is "low" | "medium" | "high" | "critical" {
  return (
    typeof value === "string" &&
    ["low", "medium", "high", "critical"].includes(value)
  );
}
