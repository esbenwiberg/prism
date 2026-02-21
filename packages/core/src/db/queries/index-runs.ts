/**
 * Index run tracking operations.
 *
 * Tracks the lifecycle of each indexing layer execution:
 * create → update progress → complete/fail.
 *
 * All functions use the shared database connection from `getDb()`.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../connection.js";
import { indexRuns } from "../schema.js";
import type { IndexStatus, LayerName } from "../../domain/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type IndexRunRow = typeof indexRuns.$inferSelect;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Create a new index run entry when a layer starts.
 */
export async function createIndexRun(
  projectId: number,
  layer: LayerName,
  filesTotal: number,
): Promise<IndexRunRow> {
  const db = getDb();
  const [row] = await db
    .insert(indexRuns)
    .values({
      projectId,
      layer,
      status: "running" satisfies IndexStatus,
      filesProcessed: 0,
      filesTotal,
      startedAt: new Date(),
    })
    .returning();
  return row;
}

/**
 * Update an index run's progress (files processed count).
 */
export async function updateIndexRunProgress(
  runId: number,
  filesProcessed: number,
): Promise<void> {
  const db = getDb();
  await db
    .update(indexRuns)
    .set({ filesProcessed })
    .where(eq(indexRuns.id, runId));
}

/**
 * Mark an index run as completed.
 */
export async function completeIndexRun(
  runId: number,
  filesProcessed: number,
  durationMs: number,
  costUsd?: number,
): Promise<IndexRunRow> {
  const db = getDb();
  const [row] = await db
    .update(indexRuns)
    .set({
      status: "completed" satisfies IndexStatus,
      filesProcessed,
      durationMs,
      costUsd: costUsd != null ? costUsd.toFixed(4) : null,
      completedAt: new Date(),
    })
    .where(eq(indexRuns.id, runId))
    .returning();
  return row;
}

/**
 * Mark an index run as failed.
 */
export async function failIndexRun(
  runId: number,
  error: string,
  filesProcessed: number,
  durationMs: number,
): Promise<IndexRunRow> {
  const db = getDb();
  const [row] = await db
    .update(indexRuns)
    .set({
      status: "failed" satisfies IndexStatus,
      filesProcessed,
      durationMs,
      error,
      completedAt: new Date(),
    })
    .where(eq(indexRuns.id, runId))
    .returning();
  return row;
}

/**
 * Get the most recent index run for a project and layer.
 */
export async function getLatestIndexRun(
  projectId: number,
  layer: LayerName,
): Promise<IndexRunRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(indexRuns)
    .where(eq(indexRuns.projectId, projectId))
    .orderBy(indexRuns.createdAt);

  // Filter by layer and get the last one
  const layerRuns = rows.filter((r) => r.layer === layer);
  return layerRuns.length > 0 ? layerRuns[layerRuns.length - 1] : undefined;
}

/**
 * Get all index runs for a project, ordered by creation time.
 */
export async function getIndexRunsByProjectId(
  projectId: number,
): Promise<IndexRunRow[]> {
  const db = getDb();
  return db
    .select()
    .from(indexRuns)
    .where(eq(indexRuns.projectId, projectId))
    .orderBy(indexRuns.createdAt);
}
