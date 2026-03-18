/**
 * Summary CRUD operations for prism_summaries table.
 *
 * All functions use the shared database connection from `getDb()`.
 */

import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "../connection.js";
import { summaries } from "../schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsertSummaryInput {
  projectId: number;
  /** Granularity level: "function", "file", "module", "system". */
  level: string;
  /** Stable identifier for the summarised target (e.g. "file:symbol:kind"). */
  targetId: string;
  /** The summary text. */
  content: string;
  /** The model used to generate the summary. */
  model: string | null;
  /** SHA-256 hash of the prompt input (for staleness detection). */
  inputHash: string | null;
  /** Cost in USD. */
  costUsd: string | null;
  /** Self-assessed quality score 0.0-1.0. */
  qualityScore: string | null;
  /** Whether this summary was demoted due to low quality. */
  demoted: boolean;
}

export type SummaryRow = typeof summaries.$inferSelect;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Insert a single summary.
 */
export async function insertSummary(
  input: InsertSummaryInput,
): Promise<SummaryRow> {
  const db = getDb();
  const [row] = await db
    .insert(summaries)
    .values(input)
    .returning();
  return row;
}

/**
 * Bulk insert summaries.
 */
export async function bulkInsertSummaries(
  inputs: InsertSummaryInput[],
): Promise<SummaryRow[]> {
  if (inputs.length === 0) return [];
  const db = getDb();
  return db.insert(summaries).values(inputs).returning();
}

/**
 * Get a summary by project ID and target ID.
 */
export async function getSummaryByTargetId(
  projectId: number,
  targetId: string,
): Promise<SummaryRow | undefined> {
  const db = getDb();
  const rows = await db
    .select()
    .from(summaries)
    .where(
      and(
        eq(summaries.projectId, projectId),
        eq(summaries.targetId, targetId),
      ),
    );
  return rows[0];
}

/**
 * Get all summaries for a project.
 */
export async function getSummariesByProjectId(
  projectId: number,
): Promise<SummaryRow[]> {
  const db = getDb();
  return db
    .select()
    .from(summaries)
    .where(eq(summaries.projectId, projectId));
}

/**
 * Get summaries for a project filtered by level.
 */
export async function getSummariesByLevel(
  projectId: number,
  level: string,
): Promise<SummaryRow[]> {
  const db = getDb();
  return db
    .select()
    .from(summaries)
    .where(
      and(
        eq(summaries.projectId, projectId),
        eq(summaries.level, level),
      ),
    );
}

/**
 * Delete all summaries for a project.
 */
export async function deleteSummariesByProjectId(
  projectId: number,
): Promise<void> {
  const db = getDb();
  await db
    .delete(summaries)
    .where(eq(summaries.projectId, projectId));
}

/**
 * Get all summaries for a project+level as a Map keyed by targetId.
 *
 * Used by the incremental analysis layer to look up existing summaries
 * for reuse / hash comparison without fetching them one at a time.
 */
export async function getSummariesByLevelAsMap(
  projectId: number,
  level: string,
): Promise<Map<string, SummaryRow>> {
  const rows = await getSummariesByLevel(projectId, level);
  const map = new Map<string, SummaryRow>();
  for (const row of rows) {
    map.set(row.targetId, row);
  }
  return map;
}

/**
 * Delete summaries for specific targets within a project+level.
 *
 * Used to clean up stale summaries before re-inserting dirty items
 * during incremental analysis.
 */
export async function deleteSummariesByTargets(
  projectId: number,
  level: string,
  targetIds: string[],
): Promise<void> {
  if (targetIds.length === 0) return;
  const db = getDb();
  await db
    .delete(summaries)
    .where(
      and(
        eq(summaries.projectId, projectId),
        eq(summaries.level, level),
        inArray(summaries.targetId, targetIds),
      ),
    );
}

/**
 * Get all existing input hashes for a project.
 *
 * Used for staleness detection — if a symbol's prompt hash matches
 * an existing summary, we can skip re-summarisation.
 */
export async function getExistingInputHashes(
  projectId: number,
): Promise<Set<string>> {
  const db = getDb();
  const rows = await db
    .select({ inputHash: summaries.inputHash })
    .from(summaries)
    .where(eq(summaries.projectId, projectId));

  const hashes = new Set<string>();
  for (const row of rows) {
    if (row.inputHash) {
      hashes.add(row.inputHash);
    }
  }
  return hashes;
}

// ---------------------------------------------------------------------------
// Quality dashboard queries
// ---------------------------------------------------------------------------

export interface QualityStats {
  total: number;
  avg: number | null;
  demotedCount: number;
}

export interface QualityBucketRow {
  bucket: string;
  count: number;
}

export interface QualityByLevelRow {
  level: string;
  avgScore: number | null;
  count: number;
}

/**
 * Get aggregate quality stats for a project: total summaries, average score,
 * and count of demoted summaries.
 */
export async function getQualityStats(
  projectId: number,
): Promise<QualityStats> {
  const db = getDb();
  const [row] = await db
    .select({
      total: sql<number>`count(*)::int`,
      avg: sql<number | null>`avg(${summaries.qualityScore})`,
      demotedCount: sql<number>`count(*) filter (where ${summaries.demoted} = true)::int`,
    })
    .from(summaries)
    .where(eq(summaries.projectId, projectId));

  return {
    total: row?.total ?? 0,
    avg: row?.avg !== null && row?.avg !== undefined ? Number(row.avg) : null,
    demotedCount: row?.demotedCount ?? 0,
  };
}

/**
 * Get quality score distribution in buckets for a project.
 */
export async function getQualityDistribution(
  projectId: number,
): Promise<QualityBucketRow[]> {
  const db = getDb();
  return db
    .select({
      bucket: sql<string>`
        case
          when ${summaries.qualityScore} is null then 'unscored'
          when ${summaries.qualityScore} < 0.2 then '0-0.2'
          when ${summaries.qualityScore} < 0.4 then '0.2-0.4'
          when ${summaries.qualityScore} < 0.6 then '0.4-0.6'
          when ${summaries.qualityScore} < 0.8 then '0.6-0.8'
          else '0.8-1.0'
        end`,
      count: sql<number>`count(*)::int`,
    })
    .from(summaries)
    .where(eq(summaries.projectId, projectId))
    .groupBy(sql`1`);
}

/**
 * Get average quality score grouped by summary level.
 */
export async function getQualityByLevel(
  projectId: number,
): Promise<QualityByLevelRow[]> {
  const db = getDb();
  return db
    .select({
      level: summaries.level,
      avgScore: sql<number | null>`avg(${summaries.qualityScore})`,
      count: sql<number>`count(*)::int`,
    })
    .from(summaries)
    .where(eq(summaries.projectId, projectId))
    .groupBy(summaries.level);
}

/**
 * Get all demoted summaries for a project.
 */
export async function getDemotedSummaries(
  projectId: number,
): Promise<SummaryRow[]> {
  const db = getDb();
  return db
    .select()
    .from(summaries)
    .where(and(eq(summaries.projectId, projectId), eq(summaries.demoted, true)));
}

/**
 * Get summaries with quality_score < threshold, sorted ascending.
 */
export async function getLowQualitySummaries(
  projectId: number,
  threshold = "0.4",
): Promise<SummaryRow[]> {
  const db = getDb();
  return db
    .select()
    .from(summaries)
    .where(
      and(
        eq(summaries.projectId, projectId),
        lt(summaries.qualityScore, threshold),
      ),
    )
    .orderBy(summaries.qualityScore);
}
