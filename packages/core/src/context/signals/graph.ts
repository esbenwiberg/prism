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
