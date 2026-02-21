/**
 * Blueprint export routes — download blueprints as markdown or JSON.
 *
 * GET /projects/:id/blueprints/export?format=md          — all blueprints as markdown
 * GET /projects/:id/blueprints/:bid/export?format=md     — single blueprint as markdown
 * GET /projects/:id/blueprints/:bid/export?format=json   — single blueprint as JSON
 */

import { Router } from "express";
import {
  getProject,
  getBlueprintPlansByProjectId,
  getBlueprintPlan,
  getBlueprintPhasesByPlanId,
  getBlueprintMilestonesByPhaseId,
} from "@prism/core";

import {
  renderFullBlueprintMarkdown,
} from "../../blueprint/markdown.js";

import type {
  MasterPlanOutline,
  BlueprintPhase,
  Risk,
} from "../../blueprint/types.js";

export const exportRouter = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

interface AssembledBlueprint {
  masterPlan: MasterPlanOutline;
  phases: BlueprintPhase[];
  planRow: {
    id: number;
    title: string;
    goal: string | null;
    model: string | null;
    costUsd: string | null;
    createdAt: Date;
  };
}

/**
 * Assemble a full blueprint (plan + phases + milestones) from the database.
 */
async function assembleBlueprint(planId: number): Promise<AssembledBlueprint | null> {
  const plan = await getBlueprintPlan(planId);
  if (!plan) return null;

  const phaseRows = await getBlueprintPhasesByPlanId(planId);

  const masterPlan: MasterPlanOutline = {
    title: plan.title,
    summary: plan.summary ?? "",
    nonGoals: (plan.nonGoals as string[]) ?? [],
    acceptanceCriteria: (plan.acceptanceCriteria as string[]) ?? [],
    risks: (plan.risks as Risk[]) ?? [],
    phases: phaseRows.map((p) => ({
      title: p.title,
      intent: p.intent ?? "",
      milestones: [],
    })),
  };

  const phases: BlueprintPhase[] = [];
  for (const phaseRow of phaseRows) {
    const milestoneRows = await getBlueprintMilestonesByPhaseId(phaseRow.id);

    // Backfill masterPlan.phases milestone titles
    const phaseIdx = phaseRow.phaseOrder - 1;
    if (masterPlan.phases[phaseIdx]) {
      masterPlan.phases[phaseIdx].milestones = milestoneRows.map((ms) => ms.title);
    }

    phases.push({
      title: phaseRow.title,
      intent: phaseRow.intent ?? "",
      milestones: milestoneRows.map((ms) => ({
        title: ms.title,
        intent: ms.intent ?? "",
        keyFiles: (ms.keyFiles as string[]) ?? [],
        verification: ms.verification ?? "",
        details: ms.details ?? "",
      })),
    });
  }

  return {
    masterPlan,
    phases,
    planRow: {
      id: plan.id,
      title: plan.title,
      goal: plan.goal,
      model: plan.model,
      costUsd: plan.costUsd,
      createdAt: plan.createdAt,
    },
  };
}

/**
 * Build a JSON-serializable representation of a blueprint.
 */
function buildJsonExport(assembled: AssembledBlueprint): object {
  return {
    title: assembled.masterPlan.title,
    goal: assembled.planRow.goal,
    summary: assembled.masterPlan.summary,
    nonGoals: assembled.masterPlan.nonGoals,
    acceptanceCriteria: assembled.masterPlan.acceptanceCriteria,
    risks: assembled.masterPlan.risks,
    model: assembled.planRow.model,
    costUsd: assembled.planRow.costUsd,
    phases: assembled.phases.map((phase, i) => ({
      phaseOrder: i + 1,
      title: phase.title,
      intent: phase.intent,
      milestones: phase.milestones.map((ms, j) => ({
        milestoneOrder: j + 1,
        title: ms.title,
        intent: ms.intent,
        keyFiles: ms.keyFiles,
        verification: ms.verification,
        details: ms.details,
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Export all blueprints for a project (markdown only)
// ---------------------------------------------------------------------------

exportRouter.get("/projects/:id/blueprints/export", async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) {
    res.status(400).send("Invalid project ID");
    return;
  }

  const format = req.query.format ?? "md";
  if (format !== "md") {
    res.status(400).send("Only format=md is supported for bulk export");
    return;
  }

  const project = await getProject(projectId);
  if (!project) {
    res.status(404).send("Project not found");
    return;
  }

  const plans = await getBlueprintPlansByProjectId(projectId);
  if (plans.length === 0) {
    res.status(404).send("No blueprints found for this project");
    return;
  }

  const parts: string[] = [];
  for (const plan of plans) {
    const assembled = await assembleBlueprint(plan.id);
    if (assembled) {
      parts.push(renderFullBlueprintMarkdown(assembled.masterPlan, assembled.phases));
    }
  }

  const markdown = parts.join("\n\n---\n\n");

  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${slugify(project.name)}-blueprints.md"`,
  );
  res.send(markdown);
});

// ---------------------------------------------------------------------------
// Export single blueprint (markdown or JSON)
// ---------------------------------------------------------------------------

exportRouter.get("/projects/:id/blueprints/:bid/export", async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const blueprintId = parseInt(req.params.bid, 10);
  if (isNaN(projectId) || isNaN(blueprintId)) {
    res.status(400).send("Invalid ID");
    return;
  }

  const format = req.query.format ?? "md";
  if (format !== "md" && format !== "json") {
    res.status(400).send("Invalid format. Use format=md or format=json");
    return;
  }

  const project = await getProject(projectId);
  if (!project) {
    res.status(404).send("Project not found");
    return;
  }

  const assembled = await assembleBlueprint(blueprintId);
  if (!assembled) {
    res.status(404).send("Blueprint not found");
    return;
  }

  const slug = slugify(assembled.planRow.title);

  if (format === "json") {
    const jsonData = buildJsonExport(assembled);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="blueprint-${slug}.json"`,
    );
    res.send(JSON.stringify(jsonData, null, 2));
    return;
  }

  // Default: markdown
  const markdown = renderFullBlueprintMarkdown(assembled.masterPlan, assembled.phases);
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="blueprint-${slug}.md"`,
  );
  res.send(markdown);
});
