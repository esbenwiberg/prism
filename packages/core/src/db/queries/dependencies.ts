/**
 * Dependency edge operations.
 *
 * All functions use the shared database connection from `getDb()`.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../connection.js";
import { dependencies } from "../schema.js";
import type { DependencyKind } from "../../domain/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsertDependencyInput {
  projectId: number;
  sourceFileId: number;
  targetFileId: number | null;
  sourceSymbolId?: number | null;
  targetSymbolId?: number | null;
  kind: DependencyKind;
}

export type DependencyRow = typeof dependencies.$inferSelect;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Bulk insert dependency edges.
 *
 * Callers should delete stale edges before inserting new ones.
 */
export async function bulkInsertDependencies(
  inputs: InsertDependencyInput[],
): Promise<DependencyRow[]> {
  if (inputs.length === 0) return [];

  const db = getDb();
  return db.insert(dependencies).values(inputs).returning();
}

/**
 * Delete all dependency edges originating from a given source file.
 */
export async function deleteDependenciesBySourceFileId(
  sourceFileId: number,
): Promise<void> {
  const db = getDb();
  await db
    .delete(dependencies)
    .where(eq(dependencies.sourceFileId, sourceFileId));
}

/**
 * Delete all dependency edges for a project.
 */
export async function deleteDependenciesByProjectId(
  projectId: number,
): Promise<void> {
  const db = getDb();
  await db
    .delete(dependencies)
    .where(eq(dependencies.projectId, projectId));
}

/**
 * Get all dependency edges for a project.
 */
export async function getDependenciesByProjectId(
  projectId: number,
): Promise<DependencyRow[]> {
  const db = getDb();
  return db
    .select()
    .from(dependencies)
    .where(eq(dependencies.projectId, projectId));
}

/**
 * Get all dependency edges where the given file is the source.
 */
export async function getDependenciesBySourceFileId(
  sourceFileId: number,
): Promise<DependencyRow[]> {
  const db = getDb();
  return db
    .select()
    .from(dependencies)
    .where(eq(dependencies.sourceFileId, sourceFileId));
}
