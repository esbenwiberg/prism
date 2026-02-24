/**
 * Job queue operations.
 *
 * Background jobs (index, blueprint) are stored in prism_jobs and claimed
 * by the worker process via `claimNextJob()` using `FOR UPDATE SKIP LOCKED`.
 *
 * All functions use the shared database connection from `getDb()`.
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "../connection.js";
import { jobs } from "../schema.js";
import type { JobStatus, JobType } from "../../domain/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobRow = typeof jobs.$inferSelect;

export interface JobOptions {
  fullReindex?: boolean;
  goal?: string;
  focus?: string;
  /** If set, only run these pipeline layers instead of the full set. */
  layers?: string[];
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Create a new pending job.
 */
export async function createJob(
  projectId: number,
  type: JobType,
  options?: JobOptions | null,
): Promise<JobRow> {
  const db = getDb();
  const [row] = await db
    .insert(jobs)
    .values({
      projectId,
      type,
      status: "pending" satisfies JobStatus,
      options: options ?? null,
    })
    .returning();
  return row;
}

/**
 * Atomically claim the next pending job.
 *
 * Uses `FOR UPDATE SKIP LOCKED` to avoid contention when multiple
 * workers poll concurrently. Returns `undefined` if no jobs are pending.
 */
export async function claimNextJob(): Promise<JobRow | undefined> {
  const db = getDb();
  const result = await db.execute(sql`
    UPDATE prism_jobs
    SET status = 'running', started_at = now()
    WHERE id = (
      SELECT id FROM prism_jobs
      WHERE status = 'pending'
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  const rows = result.rows as Array<Record<string, unknown>>;
  if (rows.length === 0) return undefined;
  return mapRawJobRow(rows[0]);
}

/**
 * Mark a job as completed.
 */
export async function completeJob(id: number): Promise<JobRow> {
  const db = getDb();
  const [row] = await db
    .update(jobs)
    .set({
      status: "completed" satisfies JobStatus,
      completedAt: new Date(),
    })
    .where(eq(jobs.id, id))
    .returning();
  return row;
}

/**
 * Mark a job as failed with an error message.
 */
export async function failJob(id: number, error: string): Promise<JobRow> {
  const db = getDb();
  const [row] = await db
    .update(jobs)
    .set({
      status: "failed" satisfies JobStatus,
      error,
      completedAt: new Date(),
    })
    .where(eq(jobs.id, id))
    .returning();
  return row;
}

/**
 * Get all jobs for a project, ordered by creation time (newest first).
 */
export async function getJobsByProjectId(
  projectId: number,
): Promise<JobRow[]> {
  const db = getDb();
  return db
    .select()
    .from(jobs)
    .where(eq(jobs.projectId, projectId))
    .orderBy(jobs.createdAt);
}

/**
 * Get the count of pending jobs (for dashboard display).
 */
export async function getPendingJobCount(): Promise<number> {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT count(*)::int AS count FROM prism_jobs WHERE status = 'pending'
  `);
  const rows = result.rows as Array<Record<string, unknown>>;
  return Number(rows[0]?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map a raw SQL result row to a typed JobRow.
 *
 * Used for `claimNextJob()` which uses raw SQL.
 */
function mapRawJobRow(raw: Record<string, unknown>): JobRow {
  return {
    id: Number(raw.id),
    projectId: Number(raw.project_id),
    type: String(raw.type),
    status: String(raw.status),
    options: raw.options as Record<string, unknown> | null,
    error: raw.error ? String(raw.error) : null,
    createdAt: new Date(String(raw.created_at)),
    startedAt: raw.started_at ? new Date(String(raw.started_at)) : null,
    completedAt: raw.completed_at
      ? new Date(String(raw.completed_at))
      : null,
  };
}
