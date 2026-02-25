/**
 * Reindex request queue operations.
 *
 * External callers (e.g. Hive) POST to /api/projects/:slug/reindex, which
 * upserts a row here. The worker polls this table every 15 minutes and
 * converts each row into a prism_jobs entry.
 *
 * The UNIQUE constraint on project_id means multiple rapid-fire requests for
 * the same repo collapse into one row.
 */

import { asc, eq } from "drizzle-orm";
import { getDb } from "../connection.js";
import { reindexRequests, projects } from "../schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReindexRequestRow = typeof reindexRequests.$inferSelect;

export interface ReindexRequestWithProject extends ReindexRequestRow {
  projectName: string;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Insert or update a reindex request for a project.
 *
 * If a request for the same project already exists, update its layers and
 * reset the timestamp so the next poll picks up the latest layer set.
 */
export async function upsertReindexRequest(
  projectId: number,
  layers: string[],
): Promise<void> {
  const db = getDb();
  await db
    .insert(reindexRequests)
    .values({ projectId, layers, requestedAt: new Date() })
    .onConflictDoUpdate({
      target: reindexRequests.projectId,
      set: { layers, requestedAt: new Date() },
    });
}

/**
 * Return all pending reindex requests, ordered oldest-first.
 */
export async function listReindexRequests(): Promise<ReindexRequestRow[]> {
  const db = getDb();
  return db
    .select()
    .from(reindexRequests)
    .orderBy(asc(reindexRequests.requestedAt));
}

/**
 * Return all pending reindex requests joined with their project name.
 */
export async function listReindexRequestsWithProjects(): Promise<ReindexRequestWithProject[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: reindexRequests.id,
      projectId: reindexRequests.projectId,
      layers: reindexRequests.layers,
      requestedAt: reindexRequests.requestedAt,
      projectName: projects.name,
    })
    .from(reindexRequests)
    .leftJoin(projects, eq(reindexRequests.projectId, projects.id))
    .orderBy(asc(reindexRequests.requestedAt));

  return rows.map((r) => ({
    ...r,
    projectName: r.projectName ?? "Unknown",
  }));
}

/**
 * Delete a single reindex request by ID.
 */
export async function deleteReindexRequest(id: number): Promise<void> {
  const db = getDb();
  await db.delete(reindexRequests).where(eq(reindexRequests.id, id));
}
