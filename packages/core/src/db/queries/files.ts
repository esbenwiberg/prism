/**
 * File CRUD and hash-check operations.
 *
 * All functions use the shared database connection from `getDb()`.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../connection.js";
import { files } from "../schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpsertFileInput {
  projectId: number;
  path: string;
  language: string | null;
  sizeBytes: number;
  lineCount: number;
  contentHash: string;
  complexity?: string | null;
  coupling?: string | null;
  cohesion?: string | null;
  isDoc?: boolean;
  isTest?: boolean;
  isConfig?: boolean;
}

export type FileRow = typeof files.$inferSelect;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Upsert a file record. If a record with the same (projectId, path) exists
 * it is updated; otherwise a new record is inserted.
 *
 * Returns the upserted row.
 */
export async function upsertFile(input: UpsertFileInput): Promise<FileRow> {
  const db = getDb();

  // Check if file already exists
  const [existing] = await db
    .select()
    .from(files)
    .where(
      and(eq(files.projectId, input.projectId), eq(files.path, input.path)),
    );

  if (existing) {
    const [updated] = await db
      .update(files)
      .set({
        language: input.language,
        sizeBytes: input.sizeBytes,
        lineCount: input.lineCount,
        contentHash: input.contentHash,
        complexity: input.complexity ?? null,
        coupling: input.coupling ?? null,
        cohesion: input.cohesion ?? null,
        isDoc: input.isDoc ?? false,
        isTest: input.isTest ?? false,
        isConfig: input.isConfig ?? false,
      })
      .where(eq(files.id, existing.id))
      .returning();
    return updated;
  }

  const [inserted] = await db
    .insert(files)
    .values({
      projectId: input.projectId,
      path: input.path,
      language: input.language,
      sizeBytes: input.sizeBytes,
      lineCount: input.lineCount,
      contentHash: input.contentHash,
      complexity: input.complexity ?? null,
      coupling: input.coupling ?? null,
      cohesion: input.cohesion ?? null,
      isDoc: input.isDoc ?? false,
      isTest: input.isTest ?? false,
      isConfig: input.isConfig ?? false,
    })
    .returning();

  return inserted;
}

/**
 * Check whether a file's content has changed by comparing the stored hash
 * to the given hash.
 *
 * Returns `true` if the file needs re-indexing (hash differs or file is new).
 */
export async function fileNeedsReindex(
  projectId: number,
  path: string,
  contentHash: string,
): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ contentHash: files.contentHash })
    .from(files)
    .where(and(eq(files.projectId, projectId), eq(files.path, path)));

  if (!row) return true; // New file
  return row.contentHash !== contentHash;
}

/**
 * Get a file by project ID and path.
 */
export async function getFileByPath(
  projectId: number,
  path: string,
): Promise<FileRow | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.projectId, projectId), eq(files.path, path)));
  return row;
}

/**
 * Get all files for a project.
 */
export async function getProjectFiles(projectId: number): Promise<FileRow[]> {
  const db = getDb();
  return db.select().from(files).where(eq(files.projectId, projectId));
}

/**
 * Delete files by their paths (for re-indexing changed files).
 */
export async function deleteFilesByPaths(
  projectId: number,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const db = getDb();
  await db
    .delete(files)
    .where(
      and(eq(files.projectId, projectId), inArray(files.path, paths)),
    );
}

/**
 * Bulk upsert files. Processes each file sequentially to handle
 * the upsert logic.
 */
export async function bulkUpsertFiles(
  inputs: UpsertFileInput[],
): Promise<FileRow[]> {
  const results: FileRow[] = [];
  for (const input of inputs) {
    results.push(await upsertFile(input));
  }
  return results;
}
