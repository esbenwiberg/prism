/**
 * CRUD operations for hierarchical blueprint tables:
 *   prism_blueprint_plans, prism_blueprint_phases, prism_blueprint_milestones.
 */

import { eq, asc } from "drizzle-orm";
import { getDb } from "../connection.js";
import { blueprintPlans, blueprintPhases, blueprintMilestones } from "../schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BlueprintPlanRow = typeof blueprintPlans.$inferSelect;
export type BlueprintPhaseRow = typeof blueprintPhases.$inferSelect;
export type BlueprintMilestoneRow = typeof blueprintMilestones.$inferSelect;

export interface InsertBlueprintPlanInput {
  projectId: number;
  title: string;
  goal?: string | null;
  summary: string;
  nonGoals?: unknown;
  acceptanceCriteria?: unknown;
  risks?: unknown;
  model?: string | null;
  costUsd?: string | null;
}

export interface InsertBlueprintPhaseInput {
  planId: number;
  projectId: number;
  phaseOrder: number;
  title: string;
  intent?: string | null;
  milestoneCount?: number | null;
  model?: string | null;
  costUsd?: string | null;
}

export interface InsertBlueprintMilestoneInput {
  phaseId: number;
  projectId: number;
  milestoneOrder: number;
  title: string;
  intent?: string | null;
  keyFiles?: unknown;
  verification?: string | null;
  details?: string | null;
  decisions?: unknown;
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

/** Insert a master blueprint plan. */
export async function insertBlueprintPlan(
  input: InsertBlueprintPlanInput,
): Promise<BlueprintPlanRow> {
  const db = getDb();
  const [row] = await db
    .insert(blueprintPlans)
    .values({
      projectId: input.projectId,
      title: input.title,
      goal: input.goal ?? null,
      summary: input.summary,
      nonGoals: input.nonGoals ?? null,
      acceptanceCriteria: input.acceptanceCriteria ?? null,
      risks: input.risks ?? null,
      model: input.model ?? null,
      costUsd: input.costUsd ?? null,
    })
    .returning();
  return row;
}

/** Get all plans for a project, newest first. */
export async function getBlueprintPlansByProjectId(
  projectId: number,
): Promise<BlueprintPlanRow[]> {
  const db = getDb();
  return db
    .select()
    .from(blueprintPlans)
    .where(eq(blueprintPlans.projectId, projectId));
}

/** Get a single plan by ID. */
export async function getBlueprintPlan(
  id: number,
): Promise<BlueprintPlanRow | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(blueprintPlans)
    .where(eq(blueprintPlans.id, id));
  return row;
}

/** Delete all plans (and cascading phases/milestones) for a project. */
export async function deleteBlueprintPlansByProjectId(
  projectId: number,
): Promise<void> {
  const db = getDb();
  await db
    .delete(blueprintPlans)
    .where(eq(blueprintPlans.projectId, projectId));
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

/** Insert a blueprint phase. */
export async function insertBlueprintPhase(
  input: InsertBlueprintPhaseInput,
): Promise<BlueprintPhaseRow> {
  const db = getDb();
  const [row] = await db
    .insert(blueprintPhases)
    .values({
      planId: input.planId,
      projectId: input.projectId,
      phaseOrder: input.phaseOrder,
      title: input.title,
      intent: input.intent ?? null,
      milestoneCount: input.milestoneCount ?? null,
      model: input.model ?? null,
      costUsd: input.costUsd ?? null,
    })
    .returning();
  return row;
}

/** Get all phases for a plan, ordered by phase_order. */
export async function getBlueprintPhasesByPlanId(
  planId: number,
): Promise<BlueprintPhaseRow[]> {
  const db = getDb();
  return db
    .select()
    .from(blueprintPhases)
    .where(eq(blueprintPhases.planId, planId))
    .orderBy(asc(blueprintPhases.phaseOrder));
}

/** Get a single phase by ID. */
export async function getBlueprintPhase(
  id: number,
): Promise<BlueprintPhaseRow | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(blueprintPhases)
    .where(eq(blueprintPhases.id, id));
  return row;
}

/** Set the review status of a phase. */
export async function updateBlueprintPhaseStatus(
  phaseId: number,
  status: "draft" | "accepted",
): Promise<void> {
  const db = getDb();
  await db
    .update(blueprintPhases)
    .set({ status })
    .where(eq(blueprintPhases.id, phaseId));
}

/** Update the free-form notes for a phase. */
export async function updateBlueprintPhaseNotes(
  phaseId: number,
  notes: string,
): Promise<void> {
  const db = getDb();
  await db
    .update(blueprintPhases)
    .set({ notes })
    .where(eq(blueprintPhases.id, phaseId));
}

/** Replace the entire chat history array for a phase. */
export async function updateBlueprintPhaseChatHistory(
  phaseId: number,
  history: unknown[],
): Promise<void> {
  const db = getDb();
  await db
    .update(blueprintPhases)
    .set({ chatHistory: history })
    .where(eq(blueprintPhases.id, phaseId));
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

/** Insert a blueprint milestone. */
export async function insertBlueprintMilestone(
  input: InsertBlueprintMilestoneInput,
): Promise<BlueprintMilestoneRow> {
  const db = getDb();
  const [row] = await db
    .insert(blueprintMilestones)
    .values({
      phaseId: input.phaseId,
      projectId: input.projectId,
      milestoneOrder: input.milestoneOrder,
      title: input.title,
      intent: input.intent ?? null,
      keyFiles: input.keyFiles ?? null,
      verification: input.verification ?? null,
      details: input.details ?? null,
      decisions: input.decisions ?? null,
    })
    .returning();
  return row;
}

/** Bulk insert milestones for a phase. */
export async function bulkInsertBlueprintMilestones(
  inputs: InsertBlueprintMilestoneInput[],
): Promise<BlueprintMilestoneRow[]> {
  if (inputs.length === 0) return [];
  const db = getDb();
  return db
    .insert(blueprintMilestones)
    .values(
      inputs.map((input) => ({
        phaseId: input.phaseId,
        projectId: input.projectId,
        milestoneOrder: input.milestoneOrder,
        title: input.title,
        intent: input.intent ?? null,
        keyFiles: input.keyFiles ?? null,
        verification: input.verification ?? null,
        details: input.details ?? null,
        decisions: input.decisions ?? null,
      })),
    )
    .returning();
}

/** Get all milestones for a phase, ordered by milestone_order. */
export async function getBlueprintMilestonesByPhaseId(
  phaseId: number,
): Promise<BlueprintMilestoneRow[]> {
  const db = getDb();
  return db
    .select()
    .from(blueprintMilestones)
    .where(eq(blueprintMilestones.phaseId, phaseId))
    .orderBy(asc(blueprintMilestones.milestoneOrder));
}

/** Get a single milestone by ID. */
export async function getBlueprintMilestone(
  id: number,
): Promise<BlueprintMilestoneRow | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(blueprintMilestones)
    .where(eq(blueprintMilestones.id, id));
  return row;
}

/** Bulk-update the detail fields of a milestone (used by the expand-milestones endpoint). */
export async function updateBlueprintMilestoneDetails(
  milestoneId: number,
  updates: {
    intent?: string | null;
    keyFiles?: string[] | null;
    verification?: string | null;
    details?: string | null;
  },
): Promise<void> {
  const db = getDb();
  await db
    .update(blueprintMilestones)
    .set(updates)
    .where(eq(blueprintMilestones.id, milestoneId));
}

/** Apply a single proposed edit to a milestone field. */
export async function updateBlueprintMilestoneField(
  milestoneId: number,
  field: "title" | "details" | "verification" | "keyFiles",
  newValue: string,
): Promise<void> {
  const db = getDb();

  if (field === "keyFiles") {
    // newValue is expected to be a JSON array string or comma-separated paths
    let parsed: string[];
    try {
      parsed = JSON.parse(newValue);
      if (!Array.isArray(parsed)) parsed = [newValue];
    } catch {
      parsed = newValue.split(",").map((s) => s.trim()).filter(Boolean);
    }
    await db
      .update(blueprintMilestones)
      .set({ keyFiles: parsed })
      .where(eq(blueprintMilestones.id, milestoneId));
  } else {
    await db
      .update(blueprintMilestones)
      .set({ [field]: newValue })
      .where(eq(blueprintMilestones.id, milestoneId));
  }
}
