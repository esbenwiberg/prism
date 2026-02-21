/**
 * Finding CRUD operations.
 *
 * All functions use the shared database connection from `getDb()`.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../connection.js";
import { findings } from "../schema.js";
import type { FindingCategory, FindingSeverity } from "../../domain/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsertFindingInput {
  projectId: number;
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  evidence?: unknown;
  suggestion?: string | null;
}

export type FindingRow = typeof findings.$inferSelect;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Bulk insert findings.
 */
export async function bulkInsertFindings(
  inputs: InsertFindingInput[],
): Promise<FindingRow[]> {
  if (inputs.length === 0) return [];
  const db = getDb();
  return db
    .insert(findings)
    .values(
      inputs.map((f) => ({
        projectId: f.projectId,
        category: f.category,
        severity: f.severity,
        title: f.title,
        description: f.description,
        evidence: f.evidence ?? null,
        suggestion: f.suggestion ?? null,
      })),
    )
    .returning();
}

/**
 * Get all findings for a project.
 */
export async function getFindingsByProjectId(
  projectId: number,
): Promise<FindingRow[]> {
  const db = getDb();
  return db
    .select()
    .from(findings)
    .where(eq(findings.projectId, projectId));
}

/**
 * Get findings for a project filtered by severity.
 */
export async function getFindingsByProjectIdAndSeverity(
  projectId: number,
  severity: FindingSeverity,
): Promise<FindingRow[]> {
  const db = getDb();
  return db
    .select()
    .from(findings)
    .where(
      and(
        eq(findings.projectId, projectId),
        eq(findings.severity, severity),
      ),
    );
}

/**
 * Delete all findings for a project.
 */
export async function deleteFindingsByProjectId(
  projectId: number,
): Promise<void> {
  const db = getDb();
  await db
    .delete(findings)
    .where(eq(findings.projectId, projectId));
}

/**
 * Count findings for a project.
 */
export async function countFindingsByProjectId(
  projectId: number,
): Promise<number> {
  const db = getDb();
  const rows = await db
    .select()
    .from(findings)
    .where(eq(findings.projectId, projectId));
  return rows.length;
}
