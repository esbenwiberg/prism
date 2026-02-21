/**
 * Project CRUD operations.
 *
 * All functions use the shared database connection from `getDb()`.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../connection.js";
import { projects } from "../schema.js";
import type { Project, IndexStatus } from "../../domain/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map a raw Drizzle row to a typed Project. */
function toProject(row: typeof projects.$inferSelect): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    language: row.language,
    totalFiles: row.totalFiles,
    totalSymbols: row.totalSymbols,
    indexStatus: row.indexStatus as IndexStatus,
    lastIndexedCommit: row.lastIndexedCommit,
    settings: row.settings as Record<string, unknown> | null,
    gitUrl: row.gitUrl,
    credentialId: row.credentialId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new project.
 */
export async function createProject(
  name: string,
  path: string,
  settings?: Record<string, unknown>,
): Promise<Project> {
  const db = getDb();
  const [row] = await db
    .insert(projects)
    .values({
      name,
      path,
      settings: settings ?? null,
    })
    .returning();
  return toProject(row);
}

/**
 * Get a project by its numeric ID.
 */
export async function getProject(id: number): Promise<Project | undefined> {
  const db = getDb();
  const [row] = await db.select().from(projects).where(eq(projects.id, id));
  return row ? toProject(row) : undefined;
}

/**
 * Get a project by its filesystem path (unique).
 */
export async function getProjectByPath(
  path: string,
): Promise<Project | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.path, path));
  return row ? toProject(row) : undefined;
}

/**
 * List all projects.
 */
export async function listProjects(): Promise<Project[]> {
  const db = getDb();
  const rows = await db.select().from(projects);
  return rows.map(toProject);
}

/**
 * Update a project by ID.
 *
 * Only the provided fields are updated; `updatedAt` is always refreshed.
 */
export async function updateProject(
  id: number,
  updates: Partial<
    Pick<
      Project,
      | "name"
      | "path"
      | "language"
      | "totalFiles"
      | "totalSymbols"
      | "indexStatus"
      | "lastIndexedCommit"
      | "settings"
      | "gitUrl"
      | "credentialId"
    >
  >,
): Promise<Project | undefined> {
  const db = getDb();
  const [row] = await db
    .update(projects)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();
  return row ? toProject(row) : undefined;
}

/**
 * Delete a project by ID.
 *
 * Returns `true` if a row was deleted.
 */
export async function deleteProject(id: number): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(projects)
    .where(eq(projects.id, id))
    .returning({ id: projects.id });
  return deleted.length > 0;
}
