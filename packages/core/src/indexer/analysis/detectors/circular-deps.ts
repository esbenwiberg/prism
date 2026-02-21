/**
 * Circular dependency detector.
 *
 * Uses Tarjan's algorithm to find strongly connected components (SCCs) in
 * the file dependency graph. An SCC with more than one node represents a
 * circular dependency chain.
 */

import type { FindingCategory, FindingSeverity } from "../../../domain/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A dependency edge between two file IDs. */
export interface DepEdge {
  sourceFileId: number;
  targetFileId: number;
}

/** A finding produced by the detector. */
export interface DetectorFinding {
  category: FindingCategory;
  severity: FindingSeverity;
  title: string;
  description: string;
  evidence: unknown;
  suggestion: string;
}

// ---------------------------------------------------------------------------
// Tarjan's SCC algorithm
// ---------------------------------------------------------------------------

/**
 * Find all strongly connected components in the graph using Tarjan's
 * algorithm (iterative to avoid stack overflow on large graphs).
 *
 * @param adjacency — Map from node ID to list of adjacent node IDs.
 * @returns Array of SCCs, each an array of node IDs.
 */
export function findSCCs(adjacency: Map<number, number[]>): number[][] {
  let indexCounter = 0;
  const stack: number[] = [];
  const onStack = new Set<number>();
  const indices = new Map<number, number>();
  const lowLinks = new Map<number, number>();
  const sccs: number[][] = [];

  function strongConnect(v: number): void {
    indices.set(v, indexCounter);
    lowLinks.set(v, indexCounter);
    indexCounter++;
    stack.push(v);
    onStack.add(v);

    const neighbors = adjacency.get(v) ?? [];
    for (const w of neighbors) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowLinks.set(v, Math.min(lowLinks.get(v)!, lowLinks.get(w)!));
      } else if (onStack.has(w)) {
        lowLinks.set(v, Math.min(lowLinks.get(v)!, indices.get(w)!));
      }
    }

    // If v is a root node, pop the SCC
    if (lowLinks.get(v) === indices.get(v)) {
      const scc: number[] = [];
      let w: number;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);
      sccs.push(scc);
    }
  }

  for (const node of adjacency.keys()) {
    if (!indices.has(node)) {
      strongConnect(node);
    }
  }

  return sccs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build an adjacency list from dependency edges (file-level).
 *
 * Only includes edges where both source and target are known (non-null
 * target). Ensures every referenced node appears as a key in the map.
 */
export function buildAdjacencyList(edges: DepEdge[]): Map<number, number[]> {
  const adj = new Map<number, number[]>();

  for (const edge of edges) {
    if (!adj.has(edge.sourceFileId)) {
      adj.set(edge.sourceFileId, []);
    }
    if (!adj.has(edge.targetFileId)) {
      adj.set(edge.targetFileId, []);
    }
    adj.get(edge.sourceFileId)!.push(edge.targetFileId);
  }

  return adj;
}

/**
 * Detect circular dependencies in the dependency graph.
 *
 * @param edges        — File-level dependency edges.
 * @param fileIdToPath — Map from file ID to project-relative path (for
 *                       readable output).
 * @returns Findings for each circular dependency cycle detected.
 */
export function detectCircularDeps(
  edges: DepEdge[],
  fileIdToPath: Map<number, string>,
): DetectorFinding[] {
  const adjacency = buildAdjacencyList(edges);
  const sccs = findSCCs(adjacency);
  const findings: DetectorFinding[] = [];

  for (const scc of sccs) {
    if (scc.length <= 1) continue; // Single-node SCCs are not circular

    const paths = scc.map((id) => fileIdToPath.get(id) ?? `file#${id}`);
    const severity: FindingSeverity =
      scc.length > 5 ? "high" : scc.length > 2 ? "medium" : "low";

    findings.push({
      category: "circular-dep",
      severity,
      title: `Circular dependency involving ${scc.length} files`,
      description: `The following files form a circular dependency chain: ${paths.join(" -> ")} -> ${paths[0]}`,
      evidence: {
        fileIds: scc,
        filePaths: paths,
        cycleLength: scc.length,
      },
      suggestion:
        "Break the cycle by introducing an interface/abstraction layer, " +
        "moving shared types to a common module, or restructuring the " +
        "dependency direction.",
    });
  }

  return findings;
}
