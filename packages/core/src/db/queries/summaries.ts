/**
 * Summary CRUD operations for prism_summaries table.
 *
 * All functions use the shared database connection from `getDb()`.
 */

import { and, eq } from "drizzle-orm";
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
