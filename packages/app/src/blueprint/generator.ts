/**
 * Blueprint generator — Layer 5.
 *
 * Feeds the complete understanding of a codebase (summaries, findings,
 * intent) to Claude Sonnet to produce structured redesign proposals.
 * Stores results in prism_blueprints.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";

import {
  logger,
  type BudgetTracker,
  type BlueprintConfig,
  type SummaryRow,
  type FindingRow,
  bulkInsertBlueprints,
  deleteBlueprintsByProjectId,
  getSummariesByLevel,
  getFindingsByProjectId,
  type BlueprintRow,
} from "@prism/core";

import type { BlueprintProposal } from "./types.js";
import { splitBySubsystem, type SubsystemGroup } from "./splitter.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SONNET_INPUT_COST_PER_TOKEN = 0.000003;
const SONNET_OUTPUT_COST_PER_TOKEN = 0.000015;

// ---------------------------------------------------------------------------
// Prompt loading
// ---------------------------------------------------------------------------

let _blueprintTemplate: string | undefined;

function loadBlueprintTemplate(basePath?: string): string {
  if (_blueprintTemplate) return _blueprintTemplate;

  const promptPath = basePath
    ? resolve(basePath, "prompts/blueprint.md")
    : resolve(process.cwd(), "prompts/blueprint.md");

  try {
    _blueprintTemplate = readFileSync(promptPath, "utf-8");
  } catch {
    _blueprintTemplate = [
      "Given the system summary, findings, and project intent below,",
      "produce redesign proposals as a JSON array.",
      "",
      "System summary: {{systemSummary}}",
      "Findings: {{findings}}",
      "Project intent: {{projectIntent}}",
    ].join("\n");
    logger.warn({ promptPath }, "Blueprint prompt not found, using fallback");
  }

  return _blueprintTemplate;
}

/**
 * Reset the cached blueprint template (for testing).
 */
export function resetBlueprintTemplate(): void {
  _blueprintTemplate = undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate redesign blueprints for a project.
 *
 * @param projectId   — The project ID.
 * @param projectName — The project name.
 * @param config      — Blueprint configuration.
 * @param budget      — Budget tracker.
 * @returns Array of blueprint rows inserted.
 */
export async function generateBlueprints(
  projectId: number,
  projectName: string,
  config: BlueprintConfig,
  budget: BudgetTracker,
): Promise<BlueprintRow[]> {
  if (!config.enabled) {
    logger.info("Blueprint generation disabled");
    return [];
  }

  logger.info({ projectId, projectName }, "Starting blueprint generation");

  // Load all data
  const [systemSummaries, moduleSummaries, findings] = await Promise.all([
    getSummariesByLevel(projectId, "system"),
    getSummariesByLevel(projectId, "module"),
    getFindingsByProjectId(projectId),
  ]);

  const systemSummary = systemSummaries[0]?.content ?? "";

  if (!systemSummary && findings.length === 0) {
    logger.info("No system summary or findings — skipping blueprint generation");
    return [];
  }

  // Split into subsystems for focused proposals
  const subsystems = splitBySubsystem(findings, moduleSummaries);

  // Build project intent from doc content (simplified)
  const projectIntent = `Project: ${projectName}`;

  // Clear old blueprints
  await deleteBlueprintsByProjectId(projectId);

  const client = new Anthropic();
  const template = loadBlueprintTemplate();

  // If we have many subsystems, generate per-subsystem. Otherwise, generate one.
  const allBlueprints: BlueprintRow[] = [];

  if (subsystems.length > 1 && findings.length > 5) {
    // Generate per subsystem group (max 5 to stay within budget)
    const groupsToProcess = subsystems.slice(0, 5);

    for (const group of groupsToProcess) {
      if (budget.exceeded) {
        logger.warn("Budget exceeded — stopping blueprint generation");
        break;
      }

      const proposals = await generateForSubsystem(
        client,
        template,
        projectId,
        projectName,
        systemSummary,
        group,
        projectIntent,
        config,
        budget,
      );

      allBlueprints.push(...proposals);
    }
  } else {
    // Single generation for the whole project
    if (!budget.exceeded) {
      const proposals = await generateForProject(
        client,
        template,
        projectId,
        projectName,
        systemSummary,
        findings,
        moduleSummaries,
        projectIntent,
        config,
        budget,
      );

      allBlueprints.push(...proposals);
    }
  }

  logger.info(
    { projectId, blueprintCount: allBlueprints.length },
    "Blueprint generation complete",
  );

  return allBlueprints;
}

// ---------------------------------------------------------------------------
// Per-subsystem generation
// ---------------------------------------------------------------------------

async function generateForSubsystem(
  client: Anthropic,
  template: string,
  projectId: number,
  projectName: string,
  systemSummary: string,
  group: SubsystemGroup,
  projectIntent: string,
  config: BlueprintConfig,
  budget: BudgetTracker,
): Promise<BlueprintRow[]> {
  const findingsText = group.findings
    .map((f) => `[${f.severity}] ${f.category}: ${f.title} — ${f.description}`)
    .join("\n");

  const moduleSummariesText = group.moduleSummaries
    .map((s) => `${s.targetId}: ${s.content}`)
    .join("\n");

  const enrichedSummary = systemSummary +
    (moduleSummariesText ? `\n\nRelevant modules:\n${moduleSummariesText}` : "");

  const prompt = template
    .replace(/\{\{projectName\}\}/g, projectName)
    .replace(/\{\{systemSummary\}\}/g, enrichedSummary)
    .replace(/\{\{findings\}\}/g, findingsText)
    .replace(/\{\{projectIntent\}\}/g, projectIntent);

  return callLLMAndPersist(client, prompt, projectId, config, budget);
}

// ---------------------------------------------------------------------------
// Whole-project generation
// ---------------------------------------------------------------------------

async function generateForProject(
  client: Anthropic,
  template: string,
  projectId: number,
  projectName: string,
  systemSummary: string,
  findings: FindingRow[],
  moduleSummaries: SummaryRow[],
  projectIntent: string,
  config: BlueprintConfig,
  budget: BudgetTracker,
): Promise<BlueprintRow[]> {
  const findingsText = findings
    .map((f) => `[${f.severity}] ${f.category}: ${f.title} — ${f.description}`)
    .join("\n");

  const moduleSummariesText = moduleSummaries
    .map((s) => `${s.targetId}: ${s.content}`)
    .join("\n");

  const enrichedSummary = systemSummary +
    (moduleSummariesText ? `\n\nModule details:\n${moduleSummariesText}` : "");

  const prompt = template
    .replace(/\{\{projectName\}\}/g, projectName)
    .replace(/\{\{systemSummary\}\}/g, enrichedSummary)
    .replace(/\{\{findings\}\}/g, findingsText || "No findings detected.")
    .replace(/\{\{projectIntent\}\}/g, projectIntent);

  return callLLMAndPersist(client, prompt, projectId, config, budget);
}

// ---------------------------------------------------------------------------
// LLM call + DB persistence
// ---------------------------------------------------------------------------

async function callLLMAndPersist(
  client: Anthropic,
  prompt: string,
  projectId: number,
  config: BlueprintConfig,
  budget: BudgetTracker,
): Promise<BlueprintRow[]> {
  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "[]";

    const costUsd =
      response.usage.input_tokens * SONNET_INPUT_COST_PER_TOKEN +
      response.usage.output_tokens * SONNET_OUTPUT_COST_PER_TOKEN;
    budget.record(costUsd);

    // Parse proposals
    const proposals = parseBlueprintProposals(rawText);

    if (proposals.length === 0) {
      logger.warn("No proposals parsed from LLM response");
      return [];
    }

    // Persist to DB
    const perProposalCost = costUsd / proposals.length;
    const rows = await bulkInsertBlueprints(
      proposals.map((p) => ({
        projectId,
        title: p.title,
        subsystem: p.subsystem,
        summary: p.summary,
        proposedArchitecture: p.proposedArchitecture,
        moduleChanges: p.moduleChanges,
        migrationPath: p.migrationPath,
        risks: p.risks,
        rationale: p.rationale,
        model: config.model,
        costUsd: perProposalCost.toFixed(4),
      })),
    );

    logger.info(
      { proposals: proposals.length, costUsd: costUsd.toFixed(4) },
      "Blueprints generated and stored",
    );

    return rows;
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "Failed to generate blueprints",
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the LLM response into typed BlueprintProposal objects.
 */
export function parseBlueprintProposals(rawText: string): BlueprintProposal[] {
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
        title: typeof item.title === "string" ? item.title : "Untitled proposal",
        subsystem: typeof item.subsystem === "string" ? item.subsystem : "general",
        summary: typeof item.summary === "string" ? item.summary : "",
        proposedArchitecture:
          typeof item.proposedArchitecture === "string"
            ? item.proposedArchitecture
            : "",
        moduleChanges: Array.isArray(item.moduleChanges) ? item.moduleChanges : [],
        migrationPath:
          typeof item.migrationPath === "string" ? item.migrationPath : "",
        risks: Array.isArray(item.risks) ? item.risks : [],
        rationale: typeof item.rationale === "string" ? item.rationale : "",
      }));
  } catch {
    logger.warn("Failed to parse blueprint proposals as JSON");
    return [];
  }
}
