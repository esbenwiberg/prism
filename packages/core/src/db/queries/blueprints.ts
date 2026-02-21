/**
 * Blueprint CRUD operations for prism_blueprints table.
 *
 * All functions use the shared database connection from `getDb()`.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../connection.js";
import { blueprints } from "../schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsertBlueprintInput {
  projectId: number;
  title: string;
  subsystem?: string | null;
  summary?: string | null;
  proposedArchitecture?: string | null;
  moduleChanges?: unknown;
  migrationPath?: string | null;
  risks?: unknown;
  rationale?: string | null;
  model?: string | null;
  costUsd?: string | null;
}

export type BlueprintRow = typeof blueprints.$inferSelect;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Insert a single blueprint.
 */
export async function insertBlueprint(
  input: InsertBlueprintInput,
): Promise<BlueprintRow> {
  const db = getDb();
  const [row] = await db
    .insert(blueprints)
    .values({
      projectId: input.projectId,
      title: input.title,
      subsystem: input.subsystem ?? null,
      summary: input.summary ?? null,
      proposedArchitecture: input.proposedArchitecture ?? null,
      moduleChanges: input.moduleChanges ?? null,
      migrationPath: input.migrationPath ?? null,
      risks: input.risks ?? null,
      rationale: input.rationale ?? null,
      model: input.model ?? null,
      costUsd: input.costUsd ?? null,
    })
    .returning();
  return row;
}

/**
 * Bulk insert blueprints.
 */
export async function bulkInsertBlueprints(
  inputs: InsertBlueprintInput[],
): Promise<BlueprintRow[]> {
  if (inputs.length === 0) return [];
  const db = getDb();
  return db
    .insert(blueprints)
    .values(
      inputs.map((input) => ({
        projectId: input.projectId,
        title: input.title,
        subsystem: input.subsystem ?? null,
        summary: input.summary ?? null,
        proposedArchitecture: input.proposedArchitecture ?? null,
        moduleChanges: input.moduleChanges ?? null,
        migrationPath: input.migrationPath ?? null,
        risks: input.risks ?? null,
        rationale: input.rationale ?? null,
        model: input.model ?? null,
        costUsd: input.costUsd ?? null,
      })),
    )
    .returning();
}

/**
 * Get all blueprints for a project.
 */
export async function getBlueprintsByProjectId(
  projectId: number,
): Promise<BlueprintRow[]> {
  const db = getDb();
  return db
    .select()
    .from(blueprints)
    .where(eq(blueprints.projectId, projectId));
}

/**
 * Get a single blueprint by ID.
 */
export async function getBlueprint(
  id: number,
): Promise<BlueprintRow | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(blueprints)
    .where(eq(blueprints.id, id));
  return row;
}

/**
 * Delete all blueprints for a project.
 */
export async function deleteBlueprintsByProjectId(
  projectId: number,
): Promise<void> {
  const db = getDb();
  await db
    .delete(blueprints)
    .where(eq(blueprints.projectId, projectId));
}

/**
 * Count blueprints for a project.
 */
export async function countBlueprintsByProjectId(
  projectId: number,
): Promise<number> {
  const db = getDb();
  const rows = await db
    .select()
    .from(blueprints)
    .where(eq(blueprints.projectId, projectId));
  return rows.length;
}
