/**
 * Commit and commit-file query operations for git history.
 */

import { and, eq, gte, lte, desc, sql } from "drizzle-orm";
import { getDb } from "../connection.js";
import { commits, commitFiles, files } from "../schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsertCommitInput {
  projectId: number;
  sha: string;
  authorName: string | null;
  authorEmail: string | null;
  committedAt: Date | null;
  message: string;
  metadata?: unknown;
}

export interface InsertCommitFileInput {
  commitId: number;
  fileId: number | null;
  filePath: string;
  changeType: string;
  linesAdded: number | null;
  linesRemoved: number | null;
}

export type CommitRow = typeof commits.$inferSelect;
export type CommitFileRow = typeof commitFiles.$inferSelect;

export interface CommitWithFiles extends CommitRow {
  files: CommitFileRow[];
}

// ---------------------------------------------------------------------------
// Insert operations
// ---------------------------------------------------------------------------

export async function bulkInsertCommits(
  inputs: InsertCommitInput[],
): Promise<CommitRow[]> {
  if (inputs.length === 0) return [];
  const db = getDb();
  return db
    .insert(commits)
    .values(inputs)
    .onConflictDoNothing()
    .returning();
}

export async function bulkInsertCommitFiles(
  inputs: InsertCommitFileInput[],
): Promise<CommitFileRow[]> {
  if (inputs.length === 0) return [];
  const db = getDb();
  return db.insert(commitFiles).values(inputs).returning();
}

// ---------------------------------------------------------------------------
// Read operations
// ---------------------------------------------------------------------------

export async function getRecentCommitsByProjectId(
  projectId: number,
  limit: number = 20,
): Promise<CommitRow[]> {
  const db = getDb();
  return db
    .select()
    .from(commits)
    .where(eq(commits.projectId, projectId))
    .orderBy(desc(commits.committedAt))
    .limit(limit);
}

export async function getRecentCommitsByFileId(
  fileId: number,
  limit: number = 10,
): Promise<CommitRow[]> {
  const db = getDb();
  const rows = await db
    .select({ commit: commits })
    .from(commitFiles)
    .innerJoin(commits, eq(commitFiles.commitId, commits.id))
    .where(eq(commitFiles.fileId, fileId))
    .orderBy(desc(commits.committedAt))
    .limit(limit);
  return rows.map((r) => r.commit);
}

export async function getRecentCommitsByDateRange(
  projectId: number,
  since: Date,
  until: Date,
): Promise<CommitRow[]> {
  const db = getDb();
  return db
    .select()
    .from(commits)
    .where(
      and(
        eq(commits.projectId, projectId),
        gte(commits.committedAt, since),
        lte(commits.committedAt, until),
      ),
    )
    .orderBy(desc(commits.committedAt));
}

export async function getCommitFilesByCommitId(
  commitId: number,
): Promise<CommitFileRow[]> {
  const db = getDb();
  return db
    .select()
    .from(commitFiles)
    .where(eq(commitFiles.commitId, commitId));
}

/**
 * Get files that frequently co-change with a given file.
 * Returns file paths and co-occurrence count.
 */
export async function getCoChangedFiles(
  projectId: number,
  fileId: number,
  limit: number = 10,
): Promise<Array<{ filePath: string; coChangeCount: number }>> {
  const db = getDb();

  const results = await db.execute(sql`
    SELECT cf2.file_path, COUNT(*)::int AS co_change_count
    FROM prism_commit_files cf1
    JOIN prism_commit_files cf2 ON cf1.commit_id = cf2.commit_id AND cf1.id != cf2.id
    JOIN prism_commits c ON c.id = cf1.commit_id
    WHERE cf1.file_id = ${fileId}
      AND c.project_id = ${projectId}
    GROUP BY cf2.file_path
    ORDER BY co_change_count DESC
    LIMIT ${limit}
  `);

  return (results.rows as Array<Record<string, unknown>>).map((r) => ({
    filePath: String(r.file_path),
    coChangeCount: Number(r.co_change_count),
  }));
}

/**
 * Get files with highest change frequency (hotspots).
 */
export async function getChangeHotspots(
  projectId: number,
  limit: number = 15,
): Promise<Array<{ filePath: string; fileId: number; changeCount: number }>> {
  const db = getDb();

  const results = await db.execute(sql`
    SELECT cf.file_path, cf.file_id, COUNT(*)::int AS change_count
    FROM prism_commit_files cf
    JOIN prism_commits c ON c.id = cf.commit_id
    WHERE c.project_id = ${projectId}
      AND cf.file_id IS NOT NULL
    GROUP BY cf.file_path, cf.file_id
    ORDER BY change_count DESC
    LIMIT ${limit}
  `);

  return (results.rows as Array<Record<string, unknown>>).map((r) => ({
    filePath: String(r.file_path),
    fileId: Number(r.file_id),
    changeCount: Number(r.change_count),
  }));
}

/**
 * Get commits in a date range with their file details.
 */
export async function getCommitsWithFileDetails(
  projectId: number,
  since: Date,
  until: Date,
): Promise<CommitWithFiles[]> {
  const commitRows = await getRecentCommitsByDateRange(projectId, since, until);

  const results: CommitWithFiles[] = [];
  for (const commit of commitRows) {
    const fileRows = await getCommitFilesByCommitId(commit.id);
    results.push({ ...commit, files: fileRows });
  }
  return results;
}

/**
 * Delete all commits (and cascade to commit_files) for a project.
 */
export async function deleteCommitsByProjectId(
  projectId: number,
): Promise<void> {
  const db = getDb();
  await db.delete(commits).where(eq(commits.projectId, projectId));
}
