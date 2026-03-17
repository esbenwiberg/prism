/**
 * Dependency graph signal collector.
 *
 * BFS traversal of the dependency graph to find related files.
 * Supports both forward (imports) and reverse (imported-by) directions.
 */

import {
  getDependenciesBySourceFileId,
  getDependenciesByTargetFileId,
} from "../../db/queries/dependencies.js";
import { getProjectFiles, type FileRow } from "../../db/queries/files.js";
import type { SignalResult, SignalItem } from "../types.js";

export interface GraphSignalOptions {
  projectId: number;
  fileId: number;
  maxDepth?: number;
  maxResults?: number;
}

interface GraphNode {
  fileId: number;
  depth: number;
  direction: "forward" | "reverse";
}

/**
 * BFS traversal of the dependency graph from a given file.
 *
 * Returns files ordered by graph distance. Files at depth 1 are
 * direct dependencies/dependents.
 */
export async function collectGraphSignal(
  options: GraphSignalOptions,
): Promise<{ forward: SignalResult; reverse: SignalResult }> {
  const { projectId, fileId, maxDepth = 2, maxResults = 20 } = options;

  // Build file lookup
  const allFiles = await getProjectFiles(projectId);
  const fileMap = new Map<number, FileRow>(allFiles.map((f) => [f.id, f]));

  // BFS forward (what does this file import?)
  const forwardItems = await bfs(fileId, maxDepth, maxResults, "forward", fileMap);
  // BFS reverse (who imports this file?)
  const reverseItems = await bfs(fileId, maxDepth, maxResults, "reverse", fileMap);

  return {
    forward: {
      heading: "Dependencies (imports)",
      priority: 3,
      items: forwardItems,
    },
    reverse: {
      heading: "Blast Radius (imported by)",
      priority: 2,
      items: reverseItems,
    },
  };
}

async function bfs(
  startFileId: number,
  maxDepth: number,
  maxResults: number,
  direction: "forward" | "reverse",
  fileMap: Map<number, FileRow>,
): Promise<SignalItem[]> {
  const visited = new Set<number>([startFileId]);
  const queue: GraphNode[] = [
    { fileId: startFileId, depth: 0, direction },
  ];
  const results: Array<{ fileId: number; depth: number }> = [];

  while (queue.length > 0 && results.length < maxResults) {
    const node = queue.shift()!;
    if (node.depth > maxDepth) continue;

    // Skip the start node itself
    if (node.depth > 0) {
      results.push({ fileId: node.fileId, depth: node.depth });
    }

    if (node.depth >= maxDepth) continue;

    const edges =
      direction === "forward"
        ? await getDependenciesBySourceFileId(node.fileId)
        : await getDependenciesByTargetFileId(node.fileId);

    for (const edge of edges) {
      const nextId =
        direction === "forward" ? edge.targetFileId : edge.sourceFileId;
      if (nextId == null || visited.has(nextId)) continue;
      visited.add(nextId);
      queue.push({ fileId: nextId, depth: node.depth + 1, direction });
    }
  }

  return results.map(({ fileId, depth }) => {
    const file = fileMap.get(fileId);
    const path = file?.path ?? `file#${fileId}`;
    // Relevance decays with depth: depth 1 = 1.0, depth 2 = 0.5, etc.
    const relevance = 1 / depth;
    return {
      content: `**${path}** (depth ${depth})`,
      relevance,
    };
  });
}

// ---------------------------------------------------------------------------
// Aggregated blast radius
// ---------------------------------------------------------------------------

export interface AggregatedBlastRadiusOptions {
  projectId: number;
  /** The task-relevant file IDs (the ones being changed) */
  sourceFileIds: number[];
  /** Max BFS depth per file (default 1 — direct dependents only) */
  maxDepth?: number;
  /** Cap total results (default 25) */
  maxResults?: number;
}

/**
 * Aggregated blast radius across multiple source files.
 *
 * For each source file, collects reverse dependencies (who imports it),
 * then merges, deduplicates, and ranks by how many source files each
 * dependent touches. Excludes the source files themselves.
 */
export async function collectAggregatedBlastRadius(
  options: AggregatedBlastRadiusOptions,
): Promise<SignalResult> {
  const { projectId, sourceFileIds, maxDepth = 1, maxResults = 25 } = options;

  if (sourceFileIds.length === 0) {
    return { heading: "Blast Radius", priority: 3, items: [] };
  }

  const sourceSet = new Set(sourceFileIds);

  const allFiles = await getProjectFiles(projectId);
  const fileMap = new Map<number, FileRow>(allFiles.map((f) => [f.id, f]));

  // Parallel BFS reverse deps for all source files
  const allReverseDeps = await Promise.all(
    sourceFileIds.map((id) => bfsCollectIds(id, maxDepth, "reverse")),
  );

  // Map<dependentFileId, Set<sourceFileId it depends on>>
  const dependentOverlap = new Map<number, Set<number>>();

  for (let i = 0; i < sourceFileIds.length; i++) {
    const sourceId = sourceFileIds[i];
    for (const depId of allReverseDeps[i]) {
      if (sourceSet.has(depId)) continue;
      if (!dependentOverlap.has(depId)) {
        dependentOverlap.set(depId, new Set());
      }
      dependentOverlap.get(depId)!.add(sourceId);
    }
  }

  // Rank by overlap count descending, then alphabetical
  const ranked = [...dependentOverlap.entries()]
    .map(([depId, sources]) => ({ depId, sources, overlapCount: sources.size }))
    .sort(
      (a, b) =>
        b.overlapCount - a.overlapCount ||
        (fileMap.get(a.depId)?.path ?? "").localeCompare(
          fileMap.get(b.depId)?.path ?? "",
        ),
    )
    .slice(0, maxResults);

  const items: SignalItem[] = ranked.map(({ depId, sources, overlapCount }) => {
    const depPath = fileMap.get(depId)?.path ?? `file#${depId}`;
    const sourceNames = [...sources]
      .map((id) => fileMap.get(id)?.path?.split("/").pop() ?? `file#${id}`)
      .join(", ");

    return {
      content: `**${depPath}** (depends on ${sourceNames})`,
      relevance: Math.min(1, overlapCount / sourceFileIds.length + 0.3),
    };
  });

  return {
    heading: `Blast Radius (${items.length} files potentially affected)`,
    priority: 3,
    items,
  };
}

async function bfsCollectIds(
  startFileId: number,
  maxDepth: number,
  direction: "forward" | "reverse",
): Promise<number[]> {
  const visited = new Set<number>([startFileId]);
  const queue: Array<{ fileId: number; depth: number }> = [
    { fileId: startFileId, depth: 0 },
  ];
  const results: number[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.depth > maxDepth) continue;
    if (node.depth > 0) results.push(node.fileId);
    if (node.depth >= maxDepth) continue;

    const edges =
      direction === "forward"
        ? await getDependenciesBySourceFileId(node.fileId)
        : await getDependenciesByTargetFileId(node.fileId);

    for (const edge of edges) {
      const nextId =
        direction === "forward" ? edge.targetFileId : edge.sourceFileId;
      if (nextId == null || visited.has(nextId)) continue;
      visited.add(nextId);
      queue.push({ fileId: nextId, depth: node.depth + 1 });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Related file IDs (bidirectional BFS)
// ---------------------------------------------------------------------------

/**
 * Get file IDs reachable from a starting file via BFS (both directions).
 * Useful for merging with semantic results.
 */
export async function getRelatedFileIds(
  projectId: number,
  fileId: number,
  maxDepth: number = 2,
): Promise<Map<number, number>> {
  const allFiles = await getProjectFiles(projectId);
  const fileMap = new Map<number, FileRow>(allFiles.map((f) => [f.id, f]));

  const visited = new Map<number, number>(); // fileId → depth
  const queue: Array<{ fileId: number; depth: number }> = [
    { fileId, depth: 0 },
  ];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.depth > maxDepth) continue;
    if (visited.has(node.fileId) && visited.get(node.fileId)! <= node.depth) continue;
    visited.set(node.fileId, node.depth);

    if (node.depth >= maxDepth) continue;

    const [forward, reverse] = await Promise.all([
      getDependenciesBySourceFileId(node.fileId),
      getDependenciesByTargetFileId(node.fileId),
    ]);

    const nextIds = new Set<number>();
    for (const e of forward) if (e.targetFileId != null) nextIds.add(e.targetFileId);
    for (const e of reverse) nextIds.add(e.sourceFileId);

    for (const nextId of nextIds) {
      if (!visited.has(nextId) || visited.get(nextId)! > node.depth + 1) {
        queue.push({ fileId: nextId, depth: node.depth + 1 });
      }
    }
  }

  visited.delete(fileId); // Remove the start file itself
  return visited;
}
