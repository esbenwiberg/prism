/**
 * Explicit file mention signal collector.
 *
 * Extracts file paths mentioned in a query (backtick-wrapped, slash-containing,
 * or extension-bearing tokens) and resolves them to project files. Mentioned
 * files get Priority 1 — they are guaranteed to appear in context.
 */

import { getProjectFiles, type FileRow } from "../../db/queries/files.js";
import { getDependenciesBySourceFileId } from "../../db/queries/dependencies.js";
import { collectFileSummariesBatch } from "./summaries.js";
import type { SignalResult, SignalItem } from "../types.js";

// ---------------------------------------------------------------------------
// Path extraction
// ---------------------------------------------------------------------------

/**
 * Extract file-path-like tokens from a query string.
 *
 * Recognises:
 * - Backtick-wrapped paths: `src/auth/service.ts`
 * - Slash-containing tokens: src/auth/service.ts
 * - Extension-bearing tokens: service.ts, connection.py
 */
export function extractFilePaths(query: string): string[] {
  const paths = new Set<string>();

  // 1. Backtick-wrapped paths
  const backtickRe = /`([^`]+\.[a-zA-Z]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = backtickRe.exec(query)) !== null) {
    paths.add(match[1]);
  }

  // 2. Slash-containing or extension-bearing tokens (not already captured)
  const tokenRe = /(?:^|\s)((?:[\w./-]+\/[\w./-]+)|(?:[\w-]+\.\w{1,10}))(?:\s|$|[,;:!?)}\]])/g;
  while ((match = tokenRe.exec(query)) !== null) {
    const token = match[1];
    // Filter out URLs, version numbers, etc.
    if (token.includes("://") || /^\d+\.\d+/.test(token)) continue;
    // Must have a file extension
    if (/\.[a-zA-Z]{1,10}$/.test(token)) {
      paths.add(token);
    }
  }

  return [...paths];
}

// ---------------------------------------------------------------------------
// Fuzzy resolution
// ---------------------------------------------------------------------------

export interface ResolvedFile {
  /** The original mentioned path from the query. */
  mentionedPath: string;
  /** The resolved project file. */
  file: FileRow;
}

/**
 * Resolve extracted path tokens to actual project files.
 *
 * Resolution strategy:
 * 1. Exact match against project file paths
 * 2. Suffix match (e.g., `service.ts` matches `src/auth/service.ts`)
 * 3. If multiple suffix matches, pick the longest (most specific) match
 */
export function resolveFilePaths(
  mentionedPaths: string[],
  projectFiles: FileRow[],
): ResolvedFile[] {
  const results: ResolvedFile[] = [];
  const seen = new Set<number>();

  for (const mentioned of mentionedPaths) {
    // 1. Exact match
    const exact = projectFiles.find((f) => f.path === mentioned);
    if (exact && !seen.has(exact.id)) {
      results.push({ mentionedPath: mentioned, file: exact });
      seen.add(exact.id);
      continue;
    }

    // 2. Suffix match
    const suffixMatches = projectFiles.filter(
      (f) => f.path.endsWith(`/${mentioned}`) || f.path === mentioned,
    );

    if (suffixMatches.length === 1 && !seen.has(suffixMatches[0].id)) {
      results.push({ mentionedPath: mentioned, file: suffixMatches[0] });
      seen.add(suffixMatches[0].id);
    } else if (suffixMatches.length > 1) {
      // Pick the longest path match (most specific)
      const sorted = suffixMatches.sort((a, b) => b.path.length - a.path.length);
      const best = sorted.find((f) => !seen.has(f.id));
      if (best) {
        results.push({ mentionedPath: mentioned, file: best });
        seen.add(best.id);
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Signal collector
// ---------------------------------------------------------------------------

export interface ExplicitMentionOptions {
  projectId: number;
  query: string;
}

/**
 * Collect explicitly mentioned files from a query.
 *
 * Returns a Priority 1 signal with file summaries for all mentioned files,
 * plus the resolved file IDs for use in blast radius computation.
 */
export async function collectExplicitMentionSignal(
  options: ExplicitMentionOptions,
): Promise<{ signal: SignalResult; resolvedFileIds: number[] }> {
  const { projectId, query } = options;

  const mentionedPaths = extractFilePaths(query);
  if (mentionedPaths.length === 0) {
    return {
      signal: { heading: "Mentioned Files", priority: 1, items: [] },
      resolvedFileIds: [],
    };
  }

  const allFiles = await getProjectFiles(projectId);
  const resolved = resolveFilePaths(mentionedPaths, allFiles);

  if (resolved.length === 0) {
    return {
      signal: { heading: "Mentioned Files", priority: 1, items: [] },
      resolvedFileIds: [],
    };
  }

  // Fetch summaries for resolved files
  const filePaths = resolved.map((r) => r.file.path);
  const summaryMap = await collectFileSummariesBatch(projectId, filePaths);

  const items: SignalItem[] = resolved.map((r) => {
    const summary = summaryMap.get(r.file.path) ?? "";
    const metrics = [
      r.file.complexity ? `complexity: ${r.file.complexity}` : null,
      r.file.lineCount ? `${r.file.lineCount} lines` : null,
      r.file.language ?? null,
    ]
      .filter(Boolean)
      .join(", ");

    return {
      content: `**${r.file.path}** ${metrics ? `(${metrics})` : ""}\n${summary}`,
      relevance: 1.0, // Highest relevance — user explicitly mentioned these
    };
  });

  return {
    signal: {
      heading: "Mentioned Files",
      priority: 1,
      items,
    },
    resolvedFileIds: resolved.map((r) => r.file.id),
  };
}

// ---------------------------------------------------------------------------
// Forward dependency signal collector
// ---------------------------------------------------------------------------

export interface MentionDependencyOptions {
  projectId: number;
  resolvedFileIds: number[];
}

/**
 * Collect forward dependencies (depth 1) for explicitly mentioned files.
 *
 * Returns two signals:
 * - "Dependencies of Mentioned Files" — all forward deps across mentioned files
 * - "Shared Dependencies" — deps imported by 2+ mentioned files (coupling points)
 *
 * Both are Priority 2 — important context but below the mentioned files themselves.
 */
export async function collectMentionDependencies(
  options: MentionDependencyOptions,
): Promise<{ forwardDeps: SignalResult; sharedDeps: SignalResult }> {
  const { projectId, resolvedFileIds } = options;

  const emptyForward: SignalResult = {
    heading: "Dependencies of Mentioned Files",
    priority: 2,
    items: [],
  };
  const emptyShared: SignalResult = {
    heading: "Shared Dependencies",
    priority: 2,
    items: [],
  };

  if (resolvedFileIds.length === 0) {
    return { forwardDeps: emptyForward, sharedDeps: emptyShared };
  }

  // Resolve all project files for ID → path lookup
  const allFiles = await getProjectFiles(projectId);
  const fileMap = new Map<number, FileRow>(allFiles.map((f) => [f.id, f]));

  // For each mentioned file, get depth-1 forward deps
  // Track: depFileId → set of source file IDs that depend on it
  const depToSources = new Map<number, Set<number>>();
  const allDepFileIds = new Set<number>();
  const mentionedSet = new Set(resolvedFileIds);

  await Promise.all(
    resolvedFileIds.map(async (sourceId) => {
      const deps = await getDependenciesBySourceFileId(sourceId);
      for (const dep of deps) {
        if (dep.targetFileId == null) continue;
        // Skip self-references and other mentioned files (already in context)
        if (mentionedSet.has(dep.targetFileId)) continue;

        allDepFileIds.add(dep.targetFileId);

        if (!depToSources.has(dep.targetFileId)) {
          depToSources.set(dep.targetFileId, new Set());
        }
        depToSources.get(dep.targetFileId)!.add(sourceId);
      }
    }),
  );

  if (allDepFileIds.size === 0) {
    return { forwardDeps: emptyForward, sharedDeps: emptyShared };
  }

  // Resolve dep file IDs to paths and fetch summaries
  const depPaths = [...allDepFileIds]
    .map((id) => fileMap.get(id)?.path)
    .filter((p): p is string => p != null);

  const summaryMap = await collectFileSummariesBatch(projectId, depPaths);

  // Build forward deps signal items
  const forwardItems: SignalItem[] = [];
  for (const depFileId of allDepFileIds) {
    const file = fileMap.get(depFileId);
    if (!file) continue;

    const summary = summaryMap.get(file.path) ?? "";
    const sourceCount = depToSources.get(depFileId)?.size ?? 0;
    const sourcePaths = [...(depToSources.get(depFileId) ?? [])]
      .map((id) => fileMap.get(id)?.path)
      .filter((p): p is string => p != null);

    const importedBy =
      sourcePaths.length > 0 ? ` (imported by: ${sourcePaths.join(", ")})` : "";

    forwardItems.push({
      content: `**${file.path}**${importedBy}\n${summary}`,
      // Shared deps are more relevant than single-source deps
      relevance: sourceCount > 1 ? 0.85 : 0.6,
    });
  }

  // Sort by relevance descending
  forwardItems.sort((a, b) => b.relevance - a.relevance);

  // Build shared deps signal (deps used by 2+ mentioned files)
  const sharedItems: SignalItem[] = [];
  if (resolvedFileIds.length > 1) {
    for (const [depFileId, sources] of depToSources) {
      if (sources.size < 2) continue;

      const file = fileMap.get(depFileId);
      if (!file) continue;

      const summary = summaryMap.get(file.path) ?? "";
      const sourcePaths = [...sources]
        .map((id) => fileMap.get(id)?.path)
        .filter((p): p is string => p != null);

      sharedItems.push({
        content: `**${file.path}** — shared by ${sourcePaths.join(", ")}\n${summary}`,
        relevance: Math.min(1, 0.7 + sources.size * 0.1),
      });
    }
    sharedItems.sort((a, b) => b.relevance - a.relevance);
  }

  return {
    forwardDeps: { ...emptyForward, items: forwardItems },
    sharedDeps: { ...emptyShared, items: sharedItems },
  };
}
