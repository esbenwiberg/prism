/**
 * Blueprints routes — hierarchical blueprint plans, phases, and milestones.
 *
 * GET /projects/:id/blueprints          — list all plans
 * GET /projects/:id/blueprints/:planId  — plan detail with phases
 * GET /blueprints/phases/:phaseId/export — export phase as markdown
 * GET /blueprints/plans/:planId/export   — export full plan as markdown
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
  renderMasterPlanMarkdown,
  renderPhaseMarkdown,
  renderFullBlueprintMarkdown,
} from "../../blueprint/markdown.js";

import type {
  MasterPlanOutline,
  BlueprintPhase,
  PhaseMilestone,
  Risk,
} from "../../blueprint/types.js";

import {
  blueprintsListPage,
  blueprintsListFragment,
  blueprintDetailPage,
  blueprintDetailFragment,
} from "../views/blueprints.js";

export const blueprintsRouter = Router();

// ---------------------------------------------------------------------------
// List plans for a project
// ---------------------------------------------------------------------------

blueprintsRouter.get("/projects/:id/blueprints", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).send("Invalid project ID");
    return;
  }

  const project = await getProject(id);
  if (!project) {
    res.status(404).send("Project not found");
    return;
  }

  const plans = await getBlueprintPlansByProjectId(id);
  const userName = req.session.user?.name ?? "User";

  const data = {
    projectId: id,
    projectName: project.name,
    plans: plans.map((p) => ({
      id: p.id,
      title: p.title,
      goal: p.goal,
      summary: p.summary,
      model: p.model,
      costUsd: p.costUsd,
      createdAt: p.createdAt,
    })),
    userName,
  };

  if (req.headers["hx-request"]) {
    res.send(blueprintsListFragment(data));
    return;
  }

  res.send(blueprintsListPage(data));
});

// ---------------------------------------------------------------------------
// Plan detail — phases + milestones
// ---------------------------------------------------------------------------

blueprintsRouter.get("/projects/:id/blueprints/:planId", async (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const planId = parseInt(req.params.planId, 10);
  if (isNaN(projectId) || isNaN(planId)) {
    res.status(400).send("Invalid ID");
    return;
  }

  const project = await getProject(projectId);
  if (!project) {
    res.status(404).send("Project not found");
    return;
  }

  const plan = await getBlueprintPlan(planId);
  if (!plan || plan.projectId !== projectId) {
    res.status(404).send("Blueprint plan not found");
    return;
  }

  const phaseRows = await getBlueprintPhasesByPlanId(planId);
  const phasesWithMilestones = await Promise.all(
    phaseRows.map(async (phase) => {
      const milestones = await getBlueprintMilestonesByPhaseId(phase.id);
      return {
        id: phase.id,
        phaseOrder: phase.phaseOrder,
        title: phase.title,
        intent: phase.intent,
        milestoneCount: phase.milestoneCount,
        model: phase.model,
        costUsd: phase.costUsd,
        milestones: milestones.map((ms) => ({
          id: ms.id,
          milestoneOrder: ms.milestoneOrder,
          title: ms.title,
          intent: ms.intent,
          keyFiles: ms.keyFiles as string[] | null,
          verification: ms.verification,
          details: ms.details,
        })),
      };
    }),
  );

  const userName = req.session.user?.name ?? "User";

  const data = {
    projectId,
    projectName: project.name,
    plan: {
      id: plan.id,
      title: plan.title,
      goal: plan.goal,
      summary: plan.summary,
      nonGoals: plan.nonGoals as string[] | null,
      acceptanceCriteria: plan.acceptanceCriteria as string[] | null,
      risks: plan.risks as Risk[] | null,
      model: plan.model,
      costUsd: plan.costUsd,
      createdAt: plan.createdAt,
    },
    phases: phasesWithMilestones,
    userName,
  };

  if (req.headers["hx-request"]) {
    res.send(blueprintDetailFragment(data));
    return;
  }

  res.send(blueprintDetailPage(data));
});

// ---------------------------------------------------------------------------
// Export phase as markdown
// ---------------------------------------------------------------------------

blueprintsRouter.get("/blueprints/phases/:phaseId/export", async (req, res) => {
  const phaseId = parseInt(req.params.phaseId, 10);
  if (isNaN(phaseId)) {
    res.status(400).send("Invalid phase ID");
    return;
  }

  const { getBlueprintPhase } = await import("@prism/core");
  const phaseRow = await getBlueprintPhase(phaseId);
  if (!phaseRow) {
    res.status(404).send("Phase not found");
    return;
  }

  const milestoneRows = await getBlueprintMilestonesByPhaseId(phaseId);

  const phase: BlueprintPhase = {
    title: phaseRow.title,
    intent: phaseRow.intent ?? "",
    milestones: milestoneRows.map((ms) => ({
      title: ms.title,
      intent: ms.intent ?? "",
      keyFiles: (ms.keyFiles as string[]) ?? [],
      verification: ms.verification ?? "",
      details: ms.details ?? "",
    })),
  };

  const markdown = renderPhaseMarkdown(phase, phaseRow.phaseOrder);

  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="phase-${phaseRow.phaseOrder}-${slugify(phaseRow.title)}.md"`,
  );
  res.send(markdown);
});

// ---------------------------------------------------------------------------
// Export full plan as markdown
// ---------------------------------------------------------------------------

blueprintsRouter.get("/blueprints/plans/:planId/export", async (req, res) => {
  const planId = parseInt(req.params.planId, 10);
  if (isNaN(planId)) {
    res.status(400).send("Invalid plan ID");
    return;
  }

  const plan = await getBlueprintPlan(planId);
  if (!plan) {
    res.status(404).send("Plan not found");
    return;
  }

  const phaseRows = await getBlueprintPhasesByPlanId(planId);

  const masterPlan: MasterPlanOutline = {
    title: plan.title,
    summary: plan.summary,
    nonGoals: (plan.nonGoals as string[]) ?? [],
    acceptanceCriteria: (plan.acceptanceCriteria as string[]) ?? [],
    risks: (plan.risks as Risk[]) ?? [],
    phases: phaseRows.map((p) => ({
      title: p.title,
      intent: p.intent ?? "",
      milestones: [], // filled below
    })),
  };

  const phases: BlueprintPhase[] = [];
  for (const phaseRow of phaseRows) {
    const milestoneRows = await getBlueprintMilestonesByPhaseId(phaseRow.id);
    // Also backfill the masterPlan.phases milestone titles
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

  const markdown = renderFullBlueprintMarkdown(masterPlan, phases);

  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="blueprint-${slugify(plan.title)}.md"`,
  );
  res.send(markdown);
});

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
