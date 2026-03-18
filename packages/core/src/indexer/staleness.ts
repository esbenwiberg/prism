/**
 * Cross-file staleness propagation.
 *
 * When file B's summary changes after reindexing, file A (which imports B)
 * may now have a stale semantic understanding. This module walks the reverse
 * dependency graph to flag direct dependents as "semantically stale" so they
 * get re-summarised even though their own content hash hasn't changed.
 */

import { getDependenciesByTargetFileId } from "../db/queries/dependencies.js";
import { getProjectFiles, type FileRow } from "../db/queries/files.js";
import { logger } from "../logger.js";

/** Maximum reverse dep propagation depth (prevents cascade explosion). */
const MAX_STALENESS_DEPTH = 1;
/** Maximum number of files to mark as stale (prevents huge re-index runs). */
const MAX_STALE_FILES = 50;

export interface StalenessResult {
  /** File paths marked as semantically stale (need re-summarisation). */
  staleFilePaths: Set<string>;
  /** Tracking info: path → reason. */
  staleReasons: Map<string, "content_changed" | "dependency_changed">;
}

/**
 * Propagate staleness from changed files to their dependents.
 *
 * Given a set of file paths that had content changes, walks their reverse
 * dependency graph (depth 1) and returns the union of:
 * - The original changed files (reason: "content_changed")
 * - Their direct dependents (reason: "dependency_changed")
 *
 * Capped at MAX_STALE_FILES to prevent cascade explosion on large changes.
 */
export async function propagateStaleness(
  projectId: number,
  changedFilePaths: Set<string>,
): Promise<StalenessResult> {
  const staleReasons = new Map<string, "content_changed" | "dependency_changed">();

  // All changed files are inherently stale
  for (const path of changedFilePaths) {
    staleReasons.set(path, "content_changed");
  }

  if (changedFilePaths.size === 0) {
    return { staleFilePaths: new Set(), staleReasons };
  }

  // Resolve changed file paths to IDs
  const allFiles = await getProjectFiles(projectId);
  const fileByPath = new Map<string, FileRow>(allFiles.map((f) => [f.path, f]));
  const fileById = new Map<number, FileRow>(allFiles.map((f) => [f.id, f]));

  const changedFileIds = new Set<number>();
  for (const path of changedFilePaths) {
    const file = fileByPath.get(path);
    if (file) changedFileIds.add(file.id);
  }

  // Walk reverse deps (depth 1) from each changed file
  const dependentIds = new Set<number>();

  for (const fileId of changedFileIds) {
    if (dependentIds.size >= MAX_STALE_FILES) break;

    const reverseDeps = await getDependenciesByTargetFileId(fileId);
    for (const dep of reverseDeps) {
      if (changedFileIds.has(dep.sourceFileId)) continue; // Already changed
      if (dependentIds.size >= MAX_STALE_FILES) break;
      dependentIds.add(dep.sourceFileId);
    }
  }

  // Resolve dependent IDs back to paths
  for (const depId of dependentIds) {
    const file = fileById.get(depId);
    if (file && !staleReasons.has(file.path)) {
      staleReasons.set(file.path, "dependency_changed");
    }
  }

  const staleFilePaths = new Set(staleReasons.keys());

  logger.info(
    {
      contentChanged: changedFilePaths.size,
      dependencyStale: dependentIds.size,
      totalStale: staleFilePaths.size,
    },
    "Staleness propagation complete",
  );

  return { staleFilePaths, staleReasons };
}
