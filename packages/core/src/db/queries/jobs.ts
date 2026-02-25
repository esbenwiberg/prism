/**
 * Job queue operations.
 *
 * Background jobs (index, blueprint) are stored in prism_jobs and claimed
 * by the worker process via `claimNextJob()` using `FOR UPDATE SKIP LOCKED`.
 *
 * All functions use the shared database connection from `getDb()`.
 */

import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { getDb } from "../connection.js";
import { jobs, indexRuns, projects } from "../schema.js";
import type { JobStatus, JobType } from "../../domain/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type JobRow = typeof jobs.$inferSelect;

export interface IndexJobWithProject extends JobRow {
  projectName: string;
}

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

/**
 * Reset all jobs stuck in "running" state (e.g. after a process crash).
 *
 * Marks them as "failed", resets the corresponding project `indexStatus`
 * back to its previous completed/partial state, and fails any in-progress
 * index runs.  Called once at worker startup.
 *
 * Returns the number of jobs that were reset.
 */
export async function resetStaleJobs(): Promise<number> {
  const db = getDb();

  // 1. Fail all running index runs
  await db
    .update(indexRuns)
    .set({
      status: "failed",
      error: "Interrupted by process restart",
      completedAt: new Date(),
    })
    .where(eq(indexRuns.status, "running"));

  // 2. Fail all running jobs and collect their project IDs
  const staleJobs = await db
    .update(jobs)
    .set({
      status: "failed" satisfies JobStatus,
      error: "Interrupted by process restart",
      completedAt: new Date(),
    })
    .where(eq(jobs.status, "running"))
    .returning({ id: jobs.id, projectId: jobs.projectId });

  // 3. Reset project indexStatus for affected projects
  const projectIds = [...new Set(staleJobs.map((j) => j.projectId))];
  for (const pid of projectIds) {
    await db
      .update(projects)
      .set({ indexStatus: "failed", updatedAt: new Date() })
      .where(eq(projects.id, pid));
  }

  return staleJobs.length;
}

/**
 * Cancel a job by setting its status to "cancelled".
 *
 * Also sets `completedAt` and fails any running index runs for the
 * job's project so layer progress shows the correct state.
 */
export async function cancelJob(id: number): Promise<JobRow> {
  const db = getDb();
  const [row] = await db
    .update(jobs)
    .set({
      status: "cancelled" satisfies JobStatus,
      completedAt: new Date(),
    })
    .where(eq(jobs.id, id))
    .returning();

  // Fail any running index runs for this project
  await db
    .update(indexRuns)
    .set({
      status: "failed",
      error: "Cancelled by user",
      completedAt: new Date(),
    })
    .where(
      and(
        eq(indexRuns.projectId, row.projectId),
        eq(indexRuns.status, "running"),
      ),
    );

  return row;
}

/**
 * Return true if the project has any pending or running job.
 *
 * Used by the reindex request processor to avoid queuing a second concurrent
 * index job for the same project.
 */
export async function hasActiveJobForProject(projectId: number): Promise<boolean> {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT 1 FROM prism_jobs
    WHERE project_id = ${projectId}
      AND status IN ('pending', 'running')
    LIMIT 1
  `);
  return result.rows.length > 0;
}

/**
 * Return the most recent index-type jobs, newest first, joined with project name.
 */
export async function listRecentIndexJobs(limit = 100): Promise<IndexJobWithProject[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: jobs.id,
      projectId: jobs.projectId,
      type: jobs.type,
      status: jobs.status,
      options: jobs.options,
      error: jobs.error,
      createdAt: jobs.createdAt,
      startedAt: jobs.startedAt,
      completedAt: jobs.completedAt,
      projectName: projects.name,
    })
    .from(jobs)
    .leftJoin(projects, eq(jobs.projectId, projects.id))
    .where(eq(jobs.type, "index"))
    .orderBy(desc(jobs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    projectName: r.projectName ?? "Unknown",
  }));
}

/**
 * Get just the status of a job (lightweight polling query).
 */
export async function getJobStatus(id: number): Promise<JobStatus | undefined> {
  const db = getDb();
  const [row] = await db
    .select({ status: jobs.status })
    .from(jobs)
    .where(eq(jobs.id, id));
  return row?.status as JobStatus | undefined;
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
