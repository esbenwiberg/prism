/**
 * Symbol bulk-insert operations.
 *
 * All functions use the shared database connection from `getDb()`.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../connection.js";
import { symbols } from "../schema.js";
import type { SymbolKind } from "../../domain/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsertSymbolInput {
  fileId: number;
  projectId: number;
  kind: SymbolKind;
  name: string;
  startLine: number | null;
  endLine: number | null;
  exported: boolean;
  signature: string | null;
  docstring: string | null;
  complexity: string | null;
}

export type SymbolRow = typeof symbols.$inferSelect;

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Bulk insert symbols for a file.
 *
 * This does NOT check for duplicates — callers should delete existing
 * symbols for the file before re-inserting.
 */
export async function bulkInsertSymbols(
  inputs: InsertSymbolInput[],
): Promise<SymbolRow[]> {
  if (inputs.length === 0) return [];

  const db = getDb();
  return db.insert(symbols).values(inputs).returning();
}

/**
 * Delete all symbols for a given file.
 */
export async function deleteSymbolsByFileId(fileId: number): Promise<void> {
  const db = getDb();
  await db.delete(symbols).where(eq(symbols.fileId, fileId));
}

/**
 * Delete all symbols for a given project.
 */
export async function deleteSymbolsByProjectId(
  projectId: number,
): Promise<void> {
  const db = getDb();
  await db.delete(symbols).where(eq(symbols.projectId, projectId));
}

/**
 * Get all symbols for a given file.
 */
export async function getSymbolsByFileId(fileId: number): Promise<SymbolRow[]> {
  const db = getDb();
  return db.select().from(symbols).where(eq(symbols.fileId, fileId));
}

/**
 * Get all symbols for a given project.
 */
export async function getSymbolsByProjectId(
  projectId: number,
): Promise<SymbolRow[]> {
  const db = getDb();
  return db.select().from(symbols).where(eq(symbols.projectId, projectId));
}
