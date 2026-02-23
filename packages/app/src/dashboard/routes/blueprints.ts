/**
 * Blueprints routes — hierarchical blueprint plans, phases, and milestones.
 *
 * GET  /projects/:id/blueprints                          — list all plans
 * GET  /projects/:id/blueprints/:planId                  — plan detail with phases
 * GET  /blueprints/phases/:phaseId/export                — export phase as markdown
 * GET  /blueprints/plans/:planId/export                  — export full plan as markdown
 * POST /blueprints/phases/:phaseId/chat                  — AI phase review chat
 * POST /blueprints/phases/:phaseId/chat/apply/:entryIndex — apply proposed edits
 * POST /blueprints/phases/:phaseId/accept                — mark phase as accepted
 * POST /blueprints/phases/:phaseId/notes                 — save phase notes
 */

import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import {
  getProject,
  getBlueprintPlansByProjectId,
  getBlueprintPlan,
  getBlueprintPhasesByPlanId,
  getBlueprintMilestonesByPhaseId,
  getBlueprintPhase,
  getBlueprintMilestone,
  updateBlueprintPhaseStatus,
  updateBlueprintPhaseNotes,
  updateBlueprintPhaseChatHistory,
  updateBlueprintMilestoneField,
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
  renderChatThread,
  renderMilestoneCard,
  type ChatEntry,
  type ProposedEdit,
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
        status: phase.status ?? "draft",
        notes: phase.notes ?? null,
        chatHistory: (phase.chatHistory as ChatEntry[] | null) ?? [],
        milestones: milestones.map((ms) => ({
          id: ms.id,
          milestoneOrder: ms.milestoneOrder,
          title: ms.title,
          intent: ms.intent,
          keyFiles: ms.keyFiles as string[] | null,
          verification: ms.verification,
          details: ms.details,
          decisions: ms.decisions as string[] | null,
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
      decisions: (ms.decisions as string[] | null) ?? undefined,
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
        decisions: (ms.decisions as string[] | null) ?? undefined,
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
// AI Phase Review — Chat
// ---------------------------------------------------------------------------

blueprintsRouter.post("/blueprints/phases/:phaseId/chat", async (req, res) => {
  const phaseId = parseInt(req.params.phaseId, 10);
  if (isNaN(phaseId)) {
    res.status(400).send("Invalid phase ID");
    return;
  }

  const userMessage = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!userMessage) {
    res.status(400).send("Message required");
    return;
  }

  const phaseRow = await getBlueprintPhase(phaseId);
  if (!phaseRow) {
    res.status(404).send("Phase not found");
    return;
  }

  const milestoneRows = await getBlueprintMilestonesByPhaseId(phaseId);
  const history: ChatEntry[] = (phaseRow.chatHistory as ChatEntry[] | null) ?? [];

  // Build system prompt
  const milestonesContext = milestoneRows.map((ms, i) => {
    const kf = (ms.keyFiles as string[] | null)?.join(", ") ?? "";
    const dec = (ms.decisions as string[] | null)?.map((d) => `  - ${d}`).join("\n") ?? "";
    return [
      `### Milestone ${i + 1}: ${ms.title} (id: ${ms.id})`,
      ms.intent ? `Intent: ${ms.intent}` : "",
      ms.details ? `Details:\n${ms.details}` : "",
      kf ? `Key files: ${kf}` : "",
      ms.verification ? `Verification: ${ms.verification}` : "",
      dec ? `Decisions:\n${dec}` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const systemPrompt = [
    `You are reviewing Phase ${phaseRow.phaseOrder}: "${phaseRow.title}" of a software redesign blueprint.`,
    `Phase intent: ${phaseRow.intent ?? ""}`,
    "",
    "## Current Milestones",
    milestonesContext,
    "",
    "## Your Role",
    "Help the user improve this phase. You can:",
    "- Explain any milestone in more detail",
    "- Suggest concrete improvements to details, key files, or verification",
    "- Propose changes to specific milestone fields",
    "",
    "## Proposing Changes",
    "When you want to propose edits to milestone fields, append a <proposal> block AFTER your response text:",
    "<proposal>",
    '[{"milestoneId": <id>, "field": "details|keyFiles|verification|title", "newValue": "..."}]',
    "</proposal>",
    "",
    'The "field" must be one of: title, details, verification, keyFiles.',
    'For "keyFiles", provide a JSON array of file path strings as the newValue.',
    'For "details", write numbered steps (1. ... 2. ... 3. ...).',
    "Only include a <proposal> block when you have concrete edits to suggest. Do not include it for informational replies.",
  ].join("\n");

  // Build messages array for Claude
  const messages: Array<{ role: "user" | "assistant"; content: string }> = history.map((e) => ({
    role: e.role,
    content: e.content,
  }));
  messages.push({ role: "user", content: userMessage });

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((b) => b.type === "text");
    const rawAssistant = textBlock && "text" in textBlock ? textBlock.text : "";

    // Parse proposal block
    const proposalMatch = rawAssistant.match(/<proposal>([\s\S]*?)<\/proposal>/);
    let proposedEdits: ProposedEdit[] | undefined;
    let displayContent = rawAssistant;

    if (proposalMatch) {
      displayContent = rawAssistant.replace(/<proposal>[\s\S]*?<\/proposal>/, "").trim();
      try {
        const parsed = JSON.parse(proposalMatch[1].trim());
        if (Array.isArray(parsed)) {
          proposedEdits = parsed.filter(
            (e): e is ProposedEdit =>
              e !== null &&
              typeof e === "object" &&
              typeof e.milestoneId === "number" &&
              typeof e.field === "string" &&
              typeof e.newValue === "string",
          );
        }
      } catch {
        // Malformed proposal block — ignore
      }
    }

    // Append entries to history
    const newHistory: ChatEntry[] = [
      ...history,
      { role: "user", content: userMessage },
      { role: "assistant", content: displayContent, proposedEdits },
    ];

    await updateBlueprintPhaseChatHistory(phaseId, newHistory as unknown[]);

    res.send(renderChatThread(phaseId, newHistory));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).send(`<p class="text-red-400 text-sm">Error: ${escapeForHtml(msg)}</p>`);
  }
});

// ---------------------------------------------------------------------------
// AI Phase Review — Apply proposed edits
// ---------------------------------------------------------------------------

blueprintsRouter.post(
  "/blueprints/phases/:phaseId/chat/apply/:entryIndex",
  async (req, res) => {
    const phaseId = parseInt(req.params.phaseId, 10);
    const entryIndex = parseInt(req.params.entryIndex, 10);
    if (isNaN(phaseId) || isNaN(entryIndex)) {
      res.status(400).send("Invalid IDs");
      return;
    }

    const phaseRow = await getBlueprintPhase(phaseId);
    if (!phaseRow) {
      res.status(404).send("Phase not found");
      return;
    }

    const history: ChatEntry[] = (phaseRow.chatHistory as ChatEntry[] | null) ?? [];
    const entry = history[entryIndex];
    if (!entry || !entry.proposedEdits || entry.proposedEdits.length === 0) {
      res.status(400).send("No proposed edits at this index");
      return;
    }

    // Apply each edit
    for (const edit of entry.proposedEdits) {
      const validFields = ["title", "details", "verification", "keyFiles"] as const;
      if (validFields.includes(edit.field as (typeof validFields)[number])) {
        await updateBlueprintMilestoneField(
          edit.milestoneId,
          edit.field as "title" | "details" | "verification" | "keyFiles",
          edit.newValue,
        );
      }
    }

    // Mark entry as applied
    const updatedHistory = history.map((e, i) =>
      i === entryIndex ? { ...e, appliedAt: new Date().toISOString() } : e,
    );
    await updateBlueprintPhaseChatHistory(phaseId, updatedHistory as unknown[]);

    // Return updated milestones HTML
    const milestoneRows = await getBlueprintMilestonesByPhaseId(phaseId);
    const milestonesHtml = milestoneRows
      .map((ms) =>
        renderMilestoneCard({
          id: ms.id,
          milestoneOrder: ms.milestoneOrder,
          title: ms.title,
          intent: ms.intent,
          keyFiles: ms.keyFiles as string[] | null,
          verification: ms.verification,
          details: ms.details,
          decisions: ms.decisions as string[] | null,
        }),
      )
      .join("");

    res.send(milestonesHtml);
  },
);

// ---------------------------------------------------------------------------
// Phase: Accept
// ---------------------------------------------------------------------------

blueprintsRouter.post("/blueprints/phases/:phaseId/accept", async (req, res) => {
  const phaseId = parseInt(req.params.phaseId, 10);
  if (isNaN(phaseId)) {
    res.status(400).send("Invalid phase ID");
    return;
  }

  const phaseRow = await getBlueprintPhase(phaseId);
  if (!phaseRow) {
    res.status(404).send("Phase not found");
    return;
  }

  await updateBlueprintPhaseStatus(phaseId, "accepted");

  // Return updated status badge HTML
  res.send(renderPhaseStatusBadge("accepted", phaseId));
});

// ---------------------------------------------------------------------------
// Phase: Save notes
// ---------------------------------------------------------------------------

blueprintsRouter.post("/blueprints/phases/:phaseId/notes", async (req, res) => {
  const phaseId = parseInt(req.params.phaseId, 10);
  if (isNaN(phaseId)) {
    res.status(400).send("Invalid phase ID");
    return;
  }

  const notes = typeof req.body?.notes === "string" ? req.body.notes : "";

  const phaseRow = await getBlueprintPhase(phaseId);
  if (!phaseRow) {
    res.status(404).send("Phase not found");
    return;
  }

  await updateBlueprintPhaseNotes(phaseId, notes);
  res.status(204).send();
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

function escapeForHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPhaseStatusBadge(status: string, phaseId: number): string {
  const isAccepted = status === "accepted";
  const badgeClass = isAccepted
    ? "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
    : "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30";
  const label = isAccepted ? "ACCEPTED" : "DRAFT";

  return `<span id="phase-status-badge-${phaseId}" class="${badgeClass}">${label}</span>`;
}
