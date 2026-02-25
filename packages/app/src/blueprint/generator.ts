/**
 * Blueprint generator — Layer 5 (hierarchical).
 *
 * Pass 1 — Master plan: produces phases with rough milestone titles.
 * Pass 2 — Phase details: called on-demand per phase via detailPhaseById().
 *
 * Results stored in prism_blueprint_plans / phases / milestones.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import {
  logger,
  createAnthropicClient,
  type BudgetTracker,
  type BlueprintConfig,
  type SummaryRow,
  type FindingRow,
  getSummariesByLevel,
  getFindingsByProjectId,
  insertBlueprintPlan,
  insertBlueprintPhase,
  bulkInsertBlueprintMilestones,
  getBlueprintPhase,
  getBlueprintMilestonesByPhaseId,
  getBlueprintPhasesByPlanId,
  getBlueprintPlan,
  updateBlueprintMilestoneDetails,
  updateBlueprintPhaseCostUsd,
  type BlueprintPlanRow,
  type BlueprintPhaseRow,
  type BlueprintMilestoneRow,
} from "@prism/core";

import type {
  MasterPlanOutline,
  BlueprintPhase,
  HierarchicalBlueprint,
  PhaseOutline,
  PhaseMilestone,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SONNET_INPUT_COST_PER_TOKEN = 0.000003;
const SONNET_OUTPUT_COST_PER_TOKEN = 0.000015;

// ---------------------------------------------------------------------------
// Prompt loading
// ---------------------------------------------------------------------------

let _masterTemplate: string | undefined;
let _phaseTemplate: string | undefined;
let _expandTemplate: string | undefined;

function loadMasterTemplate(basePath?: string): string {
  if (_masterTemplate) return _masterTemplate;

  const promptPath = basePath
    ? resolve(basePath, "prompts/blueprint-master.md")
    : resolve(process.cwd(), "prompts/blueprint-master.md");

  try {
    _masterTemplate = readFileSync(promptPath, "utf-8");
  } catch {
    _masterTemplate = [
      "Given the system summary, findings, and project intent below,",
      "produce a hierarchical redesign plan as JSON.",
      "",
      "System summary: {{systemSummary}}",
      "Findings: {{findings}}",
      "Project intent: {{projectIntent}}",
    ].join("\n");
    logger.warn({ promptPath }, "Master blueprint prompt not found, using fallback");
  }

  return _masterTemplate;
}

function loadPhaseTemplate(basePath?: string): string {
  if (_phaseTemplate) return _phaseTemplate;

  const promptPath = basePath
    ? resolve(basePath, "prompts/blueprint-phase.md")
    : resolve(process.cwd(), "prompts/blueprint-phase.md");

  try {
    _phaseTemplate = readFileSync(promptPath, "utf-8");
  } catch {
    _phaseTemplate = [
      "Detail the milestones for phase: {{phaseTitle}}",
      "Phase intent: {{phaseIntent}}",
      "System summary: {{systemSummary}}",
    ].join("\n");
    logger.warn({ promptPath }, "Phase blueprint prompt not found, using fallback");
  }

  return _phaseTemplate;
}

function loadExpandTemplate(basePath?: string): string {
  if (_expandTemplate) return _expandTemplate;

  const promptPath = basePath
    ? resolve(basePath, "prompts/blueprint-expand.md")
    : resolve(process.cwd(), "prompts/blueprint-expand.md");

  try {
    _expandTemplate = readFileSync(promptPath, "utf-8");
  } catch {
    _expandTemplate = [
      "Expand the milestones for phase: {{phaseTitle}}",
      "Phase intent: {{phaseIntent}}",
      "Milestones: {{milestones}}",
      "Return JSON array with milestoneOrder, intent, keyFiles, verification, details.",
    ].join("\n");
    logger.warn({ promptPath }, "Expand blueprint prompt not found, using fallback");
  }

  return _expandTemplate;
}

/** Reset cached templates (for testing). */
export function resetBlueprintTemplate(): void {
  _masterTemplate = undefined;
  _phaseTemplate = undefined;
  _expandTemplate = undefined;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Options for steering blueprint generation. */
export interface BlueprintOptions {
  /** User-provided redesign goal (e.g. "Productionize this PoC"). */
  goal?: string;
  /** Focus on a specific subsystem path (e.g. "src/api"). */
  focus?: string;
}

/** Result of hierarchical blueprint generation. */
export interface HierarchicalBlueprintResult {
  plan: BlueprintPlanRow;
  phases: Array<{
    phase: BlueprintPhaseRow;
    milestones: BlueprintMilestoneRow[];
  }>;
}

/**
 * Generate a hierarchical blueprint for a project (two-pass).
 *
 * @param onProgress - Called after pass 1 with (0, totalPhases) and after
 *                     each phase with (phasesComplete, totalPhases).
 * @returns The stored plan, phases, and milestones.
 */
export async function generateHierarchicalBlueprint(
  projectId: number,
  projectName: string,
  config: BlueprintConfig,
  budget: BudgetTracker,
  options?: BlueprintOptions,
  onProgress?: (phasesComplete: number, totalPhases: number) => void,
): Promise<HierarchicalBlueprintResult | null> {
  if (!config.enabled) {
    logger.info("Blueprint generation disabled");
    return null;
  }

  const goal = options?.goal;
  const focus = options?.focus;

  logger.info({ projectId, projectName, goal, focus }, "Starting hierarchical blueprint generation");

  // Load all data
  const [systemSummaries, moduleSummaries, purposeSummaries, findings] = await Promise.all([
    getSummariesByLevel(projectId, "system"),
    getSummariesByLevel(projectId, "module"),
    getSummariesByLevel(projectId, "purpose"),
    getFindingsByProjectId(projectId),
  ]);

  const systemSummary = systemSummaries[0]?.content ?? "";
  const purposeDoc = purposeSummaries[0]?.content ?? "";

  if (!systemSummary && findings.length === 0) {
    logger.info("No system summary or findings — skipping blueprint generation");
    return null;
  }

  // Filter findings by focus path if provided
  let filteredFindings = findings;
  let filteredModuleSummaries = moduleSummaries;

  if (focus) {
    filteredFindings = findings.filter((f) => {
      const evidence = f.evidence as Record<string, unknown> | null;
      if (!evidence) return false;
      const filePath =
        (typeof evidence.filePath === "string" && evidence.filePath) ||
        (typeof evidence.sourceFilePath === "string" && evidence.sourceFilePath) ||
        (Array.isArray(evidence.filePaths) && typeof evidence.filePaths[0] === "string" && evidence.filePaths[0]);
      return filePath ? filePath.startsWith(focus) : false;
    });
    filteredModuleSummaries = moduleSummaries.filter((s) => {
      const path = s.targetId.replace(/^module:/, "");
      return path === focus || path.startsWith(focus + "/");
    });
    logger.info(
      { focus, findings: filteredFindings.length, modules: filteredModuleSummaries.length },
      "Filtered by focus path",
    );
  }

  // Build project intent
  const projectIntent = buildProjectIntent(projectName, goal);

  const client = createAnthropicClient();

  // -----------------------------------------------------------------------
  // Pass 1 — Master plan
  // -----------------------------------------------------------------------
  logger.info("Pass 1: generating master plan");

  const masterPlan = await generateMasterPlan(
    client,
    projectId,
    projectName,
    purposeDoc,
    systemSummary,
    filteredModuleSummaries,
    filteredFindings,
    projectIntent,
    config,
    budget,
  );

  if (!masterPlan) {
    logger.warn("Pass 1 produced no master plan");
    return null;
  }

  logger.info(
    { phases: masterPlan.phases.length, title: masterPlan.title },
    "Master plan generated",
  );

  // Notify caller of total phases now that we know them
  onProgress?.(0, masterPlan.phases.length);

  // Persist master plan
  const planRow = await insertBlueprintPlan({
    projectId,
    title: masterPlan.title,
    goal: goal ?? null,
    summary: masterPlan.summary,
    nonGoals: masterPlan.nonGoals,
    acceptanceCriteria: masterPlan.acceptanceCriteria,
    risks: masterPlan.risks,
    model: config.model,
    costUsd: budget.spentUsd.toFixed(4),
  });

  // -----------------------------------------------------------------------
  // Persist phases + milestones (headers only — Pass 2 is on-demand)
  // -----------------------------------------------------------------------
  const result: HierarchicalBlueprintResult = {
    plan: planRow,
    phases: [],
  };

  for (let i = 0; i < masterPlan.phases.length; i++) {
    const phaseOutline = masterPlan.phases[i];

    const phaseRow = await insertBlueprintPhase({
      planId: planRow.id,
      projectId,
      phaseOrder: i + 1,
      title: phaseOutline.title,
      intent: phaseOutline.intent,
      milestoneCount: phaseOutline.milestones.length,
      model: config.model,
      costUsd: "0",
    });

    // Persist milestones with just titles — details filled on-demand
    const milestoneRows = await bulkInsertBlueprintMilestones(
      phaseOutline.milestones.map((title, j) => ({
        phaseId: phaseRow.id,
        projectId,
        milestoneOrder: j + 1,
        title,
        intent: null,
        keyFiles: null,
        verification: null,
        details: null,
        decisions: null,
      })),
    );

    result.phases.push({ phase: phaseRow, milestones: milestoneRows });
    onProgress?.(result.phases.length, masterPlan.phases.length);
  }

  logger.info(
    {
      projectId,
      phases: result.phases.length,
      totalMilestones: result.phases.reduce((n, p) => n + p.milestones.length, 0),
      costUsd: budget.spentUsd.toFixed(4),
    },
    "Hierarchical blueprint generation complete (headers only — detail on-demand)",
  );

  return result;
}

// ---------------------------------------------------------------------------
// Milestone expansion (used by expand-milestones dashboard endpoint)
// ---------------------------------------------------------------------------

/** Returns true when more than half the milestones are missing meaningful details. */
function milestonesHaveEmptyDetails(milestones: PhaseMilestone[]): boolean {
  if (milestones.length === 0) return false;
  const emptyCount = milestones.filter(
    (ms) => !ms.details || ms.details.trim().length < 30,
  ).length;
  return emptyCount > milestones.length / 2;
}

export interface MilestoneExpansion {
  milestoneOrder: number;
  intent: string;
  keyFiles: string[];
  verification: string;
  details: string;
}

/**
 * Call Claude to fill in missing intent/details for a set of milestones.
 * Used by the dashboard "Generate descriptions" button on existing blueprints.
 */
export async function expandPhaseMilestones(
  phaseTitle: string,
  phaseIntent: string,
  milestones: Array<{ milestoneOrder: number; title: string }>,
  model: string,
): Promise<MilestoneExpansion[] | null> {
  const template = loadExpandTemplate();

  const milestonesText = milestones
    .map((ms) => `${ms.milestoneOrder}. ${ms.title}`)
    .join("\n");

  const prompt = template
    .replace(/\{\{phaseTitle\}\}/g, phaseTitle)
    .replace(/\{\{phaseIntent\}\}/g, phaseIntent)
    .replace(/\{\{milestones\}\}/g, milestonesText);

  try {
    const client = createAnthropicClient();
    const response = await client.messages.create({
      model,
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "";

    return parseExpansions(rawText);
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "Failed to expand milestone descriptions",
    );
    return null;
  }
}

function parseExpansions(rawText: string): MilestoneExpansion[] | null {
  const text = stripCodeFences(rawText);
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return null;

    return (parsed as unknown[])
      .filter((e): e is Record<string, unknown> => e !== null && typeof e === "object")
      .map((e) => ({
        milestoneOrder: typeof e.milestoneOrder === "number" ? e.milestoneOrder : 0,
        intent: typeof e.intent === "string" ? e.intent : "",
        keyFiles: Array.isArray(e.keyFiles)
          ? (e.keyFiles as unknown[]).filter((f): f is string => typeof f === "string")
          : [],
        verification: typeof e.verification === "string" ? e.verification : "",
        details: typeof e.details === "string" ? e.details : "",
      }))
      .filter((e) => e.milestoneOrder > 0);
  } catch {
    logger.warn("Failed to parse milestone expansions as JSON");
    return null;
  }
}

// ---------------------------------------------------------------------------
// On-demand phase detailing
// ---------------------------------------------------------------------------

/**
 * Detail a single phase by its DB id. Loads context from DB,
 * calls the LLM to generate full milestone details, and persists them.
 *
 * Returns the updated milestone rows, or null on failure.
 */
export async function detailPhaseById(
  phaseId: number,
  model: string,
): Promise<BlueprintMilestoneRow[] | null> {
  const phaseRow = await getBlueprintPhase(phaseId);
  if (!phaseRow) {
    logger.warn({ phaseId }, "detailPhaseById: phase not found");
    return null;
  }

  const planRow = await getBlueprintPlan(phaseRow.planId);
  if (!planRow) {
    logger.warn({ planId: phaseRow.planId }, "detailPhaseById: plan not found");
    return null;
  }

  // Load sibling phases for context
  const allPhaseRows = await getBlueprintPhasesByPlanId(phaseRow.planId);
  const phaseIndex = allPhaseRows.findIndex((p) => p.id === phaseId);

  // Load summaries and findings
  const [systemSummaries, findings] = await Promise.all([
    getSummariesByLevel(planRow.projectId, "system"),
    getFindingsByProjectId(planRow.projectId),
  ]);
  const systemSummary = systemSummaries[0]?.content ?? "";

  // Reconstruct MasterPlanOutline
  const phaseOutlines: PhaseOutline[] = [];
  for (const pr of allPhaseRows) {
    const ms = await getBlueprintMilestonesByPhaseId(pr.id);
    phaseOutlines.push({
      title: pr.title,
      intent: pr.intent ?? "",
      milestones: ms.map((m) => m.title),
    });
  }

  const masterPlan: MasterPlanOutline = {
    title: planRow.title,
    summary: planRow.summary,
    nonGoals: (planRow.nonGoals as string[]) ?? [],
    acceptanceCriteria: (planRow.acceptanceCriteria as string[]) ?? [],
    risks: (planRow.risks as Array<{ risk: string; severity: "low" | "medium" | "high"; mitigation: string }>) ?? [],
    phases: phaseOutlines,
  };

  const phaseOutline = phaseOutlines[phaseIndex];
  const previousPhases = phaseOutlines.slice(0, phaseIndex);
  const nextPhases = phaseOutlines.slice(phaseIndex + 1);

  const client = createAnthropicClient();
  const budget = createBudgetTrackerForDetail();
  const config: BlueprintConfig = { enabled: true, model, budgetUsd: 5 };

  logger.info(
    { phaseId, phaseOrder: phaseRow.phaseOrder, title: phaseRow.title },
    "Detailing phase on-demand",
  );

  let phaseDetail = await generatePhaseDetail(
    client,
    planRow.title,
    systemSummary,
    masterPlan,
    phaseOutline,
    phaseRow.phaseOrder,
    allPhaseRows.length,
    previousPhases,
    nextPhases,
    findings,
    config,
    budget,
  );

  // Retry once if milestones came back with empty details
  if (phaseDetail && milestonesHaveEmptyDetails(phaseDetail.milestones)) {
    logger.warn({ phaseId }, "Phase milestones have empty details — retrying");
    const retry = await generatePhaseDetail(
      client,
      planRow.title,
      systemSummary,
      masterPlan,
      phaseOutline,
      phaseRow.phaseOrder,
      allPhaseRows.length,
      previousPhases,
      nextPhases,
      findings,
      config,
      budget,
    );
    if (retry && !milestonesHaveEmptyDetails(retry.milestones)) {
      phaseDetail = retry;
    }
  }

  if (!phaseDetail) {
    logger.warn({ phaseId }, "Phase detail generation returned null");
    return null;
  }

  // Update existing milestones with the details
  const existingMilestones = await getBlueprintMilestonesByPhaseId(phaseId);
  for (const ms of phaseDetail.milestones) {
    const existing = existingMilestones.find(
      (em) => em.title === ms.title || em.milestoneOrder === phaseDetail!.milestones.indexOf(ms) + 1,
    );
    if (existing) {
      await updateBlueprintMilestoneDetails(existing.id, {
        intent: ms.intent || null,
        keyFiles: ms.keyFiles?.length ? ms.keyFiles : null,
        verification: ms.verification || null,
        details: ms.details || null,
      });
    }
  }

  // Record cost on the phase
  await updateBlueprintPhaseCostUsd(phaseId, budget.spentUsd.toFixed(4));

  logger.info(
    { phaseId, costUsd: budget.spentUsd.toFixed(4) },
    "Phase detail generation complete",
  );

  return getBlueprintMilestonesByPhaseId(phaseId);
}

/** Lightweight budget tracker for on-demand detailing (no global budget). */
function createBudgetTrackerForDetail(): BudgetTracker {
  return {
    budgetUsd: 5,
    spentUsd: 0,
    get exceeded() {
      return this.spentUsd >= this.budgetUsd;
    },
    get remaining() {
      return Math.max(0, this.budgetUsd - this.spentUsd);
    },
    record(amountUsd: number) {
      this.spentUsd += amountUsd;
    },
  };
}

// ---------------------------------------------------------------------------
// Legacy API (backward compat during migration)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use generateHierarchicalBlueprint instead.
 * Kept temporarily so existing callers compile.
 */
export async function generateBlueprints(
  projectId: number,
  projectName: string,
  config: BlueprintConfig,
  budget: BudgetTracker,
  options?: BlueprintOptions,
): Promise<HierarchicalBlueprintResult | null> {
  return generateHierarchicalBlueprint(projectId, projectName, config, budget, options);
}

// ---------------------------------------------------------------------------
// Pass 1 — Master plan generation
// ---------------------------------------------------------------------------

async function generateMasterPlan(
  client: Anthropic,
  projectId: number,
  projectName: string,
  purposeDoc: string,
  systemSummary: string,
  moduleSummaries: SummaryRow[],
  findings: FindingRow[],
  projectIntent: string,
  config: BlueprintConfig,
  budget: BudgetTracker,
): Promise<MasterPlanOutline | null> {
  const template = loadMasterTemplate();

  const findingsText = findings.length > 0
    ? findings
        .map((f) => `[${f.severity}] ${f.category}: ${f.title} — ${f.description}`)
        .join("\n")
    : "No findings detected.";

  const moduleSummariesText = moduleSummaries
    .map((s) => `${s.targetId}: ${s.content}`)
    .join("\n");

  const prompt = template
    .replace(/\{\{projectName\}\}/g, projectName)
    .replace(/\{\{purposeDoc\}\}/g, purposeDoc || "No purpose document available.")
    .replace(/\{\{systemSummary\}\}/g, systemSummary)
    .replace(/\{\{moduleSummaries\}\}/g, moduleSummariesText || "No module summaries available.")
    .replace(/\{\{findings\}\}/g, findingsText)
    .replace(/\{\{projectIntent\}\}/g, projectIntent);

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "";

    const costUsd =
      response.usage.input_tokens * SONNET_INPUT_COST_PER_TOKEN +
      response.usage.output_tokens * SONNET_OUTPUT_COST_PER_TOKEN;
    budget.record(costUsd);

    return parseMasterPlanOutline(rawText);
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "Failed to generate master plan",
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pass 2 — Per-phase detail generation
// ---------------------------------------------------------------------------

export async function generatePhaseDetail(
  client: Anthropic,
  projectName: string,
  systemSummary: string,
  masterPlan: MasterPlanOutline,
  phaseOutline: PhaseOutline,
  phaseOrder: number,
  totalPhases: number,
  previousPhases: PhaseOutline[],
  nextPhases: PhaseOutline[],
  findings: FindingRow[],
  config: BlueprintConfig,
  budget: BudgetTracker,
): Promise<BlueprintPhase | null> {
  const template = loadPhaseTemplate();

  const previousPhasesText = previousPhases.length > 0
    ? previousPhases.map((p, i) => `${i + 1}. ${p.title}: ${p.intent}`).join("\n")
    : "None (this is the first phase)";

  const nextPhasesText = nextPhases.length > 0
    ? nextPhases.map((p, i) => `${phaseOrder + i + 1}. ${p.title}: ${p.intent}`).join("\n")
    : "None (this is the last phase)";

  const milestoneTitlesText = phaseOutline.milestones
    .map((m, i) => `${i + 1}. ${m}`)
    .join("\n");

  const findingsText = findings.length > 0
    ? findings
        .map((f) => `[${f.severity}] ${f.category}: ${f.title} — ${f.description}`)
        .join("\n")
    : "No findings.";

  const prompt = template
    .replace(/\{\{projectName\}\}/g, projectName)
    .replace(/\{\{masterPlanSummary\}\}/g, masterPlan.summary)
    .replace(/\{\{previousPhases\}\}/g, previousPhasesText)
    .replace(/\{\{nextPhases\}\}/g, nextPhasesText)
    .replace(/\{\{phaseOrder\}\}/g, String(phaseOrder))
    .replace(/\{\{totalPhases\}\}/g, String(totalPhases))
    .replace(/\{\{phaseTitle\}\}/g, phaseOutline.title)
    .replace(/\{\{phaseIntent\}\}/g, phaseOutline.intent)
    .replace(/\{\{milestoneTitles\}\}/g, milestoneTitlesText)
    .replace(/\{\{relevantFindings\}\}/g, findingsText)
    .replace(/\{\{systemSummary\}\}/g, systemSummary);

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const rawText = textBlock && "text" in textBlock ? textBlock.text : "";

    const costUsd =
      response.usage.input_tokens * SONNET_INPUT_COST_PER_TOKEN +
      response.usage.output_tokens * SONNET_OUTPUT_COST_PER_TOKEN;
    budget.record(costUsd);

    return parsePhaseDetail(rawText);
  } catch (err) {
    logger.error(
      { error: err instanceof Error ? err.message : String(err), phase: phaseOutline.title },
      "Failed to generate phase detail",
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the master plan LLM response into a MasterPlanOutline.
 */
export function parseMasterPlanOutline(rawText: string): MasterPlanOutline | null {
  const text = stripCodeFences(rawText);

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return null;

    const obj = parsed as Record<string, unknown>;

    const phases: PhaseOutline[] = Array.isArray(obj.phases)
      ? (obj.phases as Record<string, unknown>[])
          .filter((p): p is Record<string, unknown> => p !== null && typeof p === "object")
          .map((p) => ({
            title: typeof p.title === "string" ? p.title : "Untitled phase",
            intent: typeof p.intent === "string" ? p.intent : "",
            milestones: Array.isArray(p.milestones)
              ? (p.milestones as unknown[]).filter((m): m is string => typeof m === "string")
              : [],
          }))
      : [];

    if (phases.length === 0) {
      logger.warn("Master plan has no phases");
      return null;
    }

    return {
      title: typeof obj.title === "string" ? obj.title : "Untitled Blueprint",
      summary: typeof obj.summary === "string" ? obj.summary : "",
      nonGoals: Array.isArray(obj.nonGoals)
        ? (obj.nonGoals as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      acceptanceCriteria: Array.isArray(obj.acceptanceCriteria)
        ? (obj.acceptanceCriteria as unknown[]).filter((x): x is string => typeof x === "string")
        : [],
      risks: parseRisks(obj.risks),
      phases,
    };
  } catch {
    logger.warn("Failed to parse master plan as JSON");
    return null;
  }
}

/**
 * Parse a phase detail LLM response into a BlueprintPhase.
 */
export function parsePhaseDetail(rawText: string): BlueprintPhase | null {
  const text = stripCodeFences(rawText);

  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") return null;

    const obj = parsed as Record<string, unknown>;

    const milestones: PhaseMilestone[] = Array.isArray(obj.milestones)
      ? (obj.milestones as Record<string, unknown>[])
          .filter((m): m is Record<string, unknown> => m !== null && typeof m === "object")
          .map((m) => ({
            title: typeof m.title === "string" ? m.title : "Untitled milestone",
            intent: typeof m.intent === "string" ? m.intent : "",
            keyFiles: Array.isArray(m.keyFiles)
              ? (m.keyFiles as unknown[]).filter((f): f is string => typeof f === "string")
              : [],
            verification: typeof m.verification === "string" ? m.verification : "",
            details: typeof m.details === "string" ? m.details : "",
            decisions: Array.isArray(m.decisions)
              ? (m.decisions as unknown[]).filter((d): d is string => typeof d === "string")
              : undefined,
          }))
      : [];

    return {
      title: typeof obj.title === "string" ? obj.title : "Untitled phase",
      intent: typeof obj.intent === "string" ? obj.intent : "",
      milestones,
    };
  } catch {
    logger.warn({ rawText: rawText.slice(0, 500) }, "Failed to parse phase detail as JSON");
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildProjectIntent(projectName: string, goal?: string): string {
  const parts: string[] = [`Project: ${projectName}`];

  if (goal) {
    parts.push("");
    parts.push(`## Redesign Goal`);
    parts.push(goal);
    parts.push("");
    parts.push(
      "All phases and milestones MUST directly serve the stated goal above. " +
      "Prioritize changes that move the codebase toward this goal. " +
      "Deprioritize or omit changes unrelated to the goal.",
    );
  }

  return parts.join("\n");
}

function stripCodeFences(text: string): string {
  let t = text.trim();
  // Strip leading code fence (with optional language tag)
  t = t.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  t = t.trim();
  // If there's still no leading `{`, try to extract the JSON object
  // by finding the first `{` and last `}` — handles cases where the LLM
  // adds commentary before or after the JSON despite instructions not to.
  if (!t.startsWith("{") && !t.startsWith("[")) {
    const start = t.indexOf("{");
    const startArr = t.indexOf("[");
    const firstBrace = start === -1 ? startArr : startArr === -1 ? start : Math.min(start, startArr);
    if (firstBrace !== -1) {
      const openChar = t[firstBrace];
      const closeChar = openChar === "{" ? "}" : "]";
      const end = t.lastIndexOf(closeChar);
      if (end > firstBrace) {
        t = t.slice(firstBrace, end + 1);
      }
    }
  }
  return t;
}

function parseRisks(raw: unknown): Array<{ risk: string; severity: "low" | "medium" | "high"; mitigation: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => r !== null && typeof r === "object")
    .map((r) => ({
      risk: typeof r.risk === "string" ? r.risk : "",
      severity: (typeof r.severity === "string" && ["low", "medium", "high"].includes(r.severity)
        ? r.severity
        : "low") as "low" | "medium" | "high",
      mitigation: typeof r.mitigation === "string" ? r.mitigation : "",
    }));
}

/**
 * Create fallback milestones from a phase outline when pass 2 fails.
 */
function fallbackMilestones(outline: PhaseOutline): PhaseMilestone[] {
  return outline.milestones.map((title) => ({
    title,
    intent: "",
    keyFiles: [],
    verification: "",
    details: "",
    decisions: undefined,
  }));
}

// ---------------------------------------------------------------------------
// Legacy parsing (kept for test backward compat)
// ---------------------------------------------------------------------------

interface BlueprintProposal {
  title: string;
  subsystem: string;
  summary: string;
  proposedArchitecture: string;
  moduleChanges: Array<{ module: string; action: string; description: string }>;
  migrationPath: string;
  risks: Array<{ risk: string; severity: string; mitigation: string }>;
  rationale: string;
}

/** @deprecated Legacy parser, kept temporarily for test compatibility. */
export function parseBlueprintProposals(rawText: string): BlueprintProposal[] {
  const text = stripCodeFences(rawText);

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
