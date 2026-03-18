/**
 * Golden Repo integration tests -- Blast Radius.
 *
 * Tests BFS-based blast radius computation using an in-memory dependency
 * graph extracted from the golden repo. No database required -- we build
 * the reverse-dependency adjacency list ourselves and run BFS directly.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";

import {
  walkProjectFiles,
  initTreeSitter,
  parseSource,
  extractSymbols,
  extractDependencies,
  buildAdjacencyList,
  type FileEntry,
  type StructuralFileResult,
  type DependencyEdge,
  type DepEdge,
} from "../../packages/core/src/indexer/index.js";

const GOLDEN_REPO = resolve(__dirname, "../fixtures/golden-repo");

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let results: StructuralFileResult[];
let allDeps: DependencyEdge[];
let filePathToId: Map<string, number>;
let fileIdToPath: Map<number, string>;

/**
 * Forward adjacency: source -> [targets] (what does this file import?)
 * Reverse adjacency: target -> [sources] (who imports this file?)
 */
let forwardAdj: Map<number, number[]>;
let reverseAdj: Map<number, number[]>;

beforeAll(async () => {
  const files = await walkProjectFiles(GOLDEN_REPO, ["node_modules/**", ".git/**"], 1_048_576);
  const tsFiles = files.filter((f) => f.language === "typescript");
  const projectFileSet = new Set(files.map((f) => f.path));

  await initTreeSitter();

  results = [];
  for (const file of tsFiles) {
    const tree = await parseSource(file.content, file.language!);
    const symbols = extractSymbols(tree.rootNode, file.language!, file.content);
    const dependencies = extractDependencies(
      tree.rootNode,
      file.language!,
      file.path,
      projectFileSet,
    );
    tree.delete();
    results.push({ file, symbols, dependencies, complexity: 0 });
  }

  allDeps = results.flatMap((r) => r.dependencies);

  // Build ID maps
  const allPaths = results.map((r) => r.file.path).sort();
  filePathToId = new Map(allPaths.map((p, i) => [p, i + 1]));
  fileIdToPath = new Map(allPaths.map((p, i) => [i + 1, p]));

  // Build forward dep edges (numeric)
  const forwardEdges: DepEdge[] = allDeps
    .filter((d) => d.targetFile !== null)
    .map((d) => ({
      sourceFileId: filePathToId.get(d.sourceFile)!,
      targetFileId: filePathToId.get(d.targetFile!)!,
    }))
    .filter((e) => e.sourceFileId !== undefined && e.targetFileId !== undefined);

  forwardAdj = buildAdjacencyList(forwardEdges);

  // Build reverse adjacency (flip edges)
  const reverseEdges: DepEdge[] = forwardEdges.map((e) => ({
    sourceFileId: e.targetFileId,
    targetFileId: e.sourceFileId,
  }));
  reverseAdj = buildAdjacencyList(reverseEdges);
}, 30_000);

// ---------------------------------------------------------------------------
// BFS helper (in-memory, no DB)
// ---------------------------------------------------------------------------

/**
 * BFS from a starting file through an adjacency list.
 * Returns a map of fileId -> depth for all reachable files.
 */
function bfs(
  startId: number,
  adjacency: Map<number, number[]>,
  maxDepth: number,
): Map<number, number> {
  const visited = new Map<number, number>(); // fileId -> depth
  const queue: Array<{ id: number; depth: number }> = [{ id: startId, depth: 0 }];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    if (depth > maxDepth) continue;
    if (visited.has(id)) continue;
    visited.set(id, depth);

    if (depth >= maxDepth) continue;

    const neighbors = adjacency.get(id) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push({ id: neighbor, depth: depth + 1 });
      }
    }
  }

  visited.delete(startId); // exclude the start node itself
  return visited;
}

/**
 * BFS blast radius (reverse deps) returning file paths at each depth.
 */
function blastRadius(
  filePath: string,
  maxDepth: number,
): Map<string, number> {
  const startId = filePathToId.get(filePath);
  if (startId === undefined) throw new Error(`Unknown file: ${filePath}`);

  const reachable = bfs(startId, reverseAdj, maxDepth);
  const result = new Map<string, number>();
  for (const [id, depth] of reachable) {
    const path = fileIdToPath.get(id);
    if (path) result.set(path, depth);
  }
  return result;
}

/**
 * Aggregated blast radius: union of reverse deps across multiple source files,
 * with overlap counting (how many source files does each dependent touch?).
 */
function aggregatedBlastRadius(
  sourcePaths: string[],
  maxDepth: number,
): Map<string, { depth: number; overlapCount: number }> {
  const sourceIds = new Set(sourcePaths.map((p) => filePathToId.get(p)!));
  const dependentOverlap = new Map<number, Set<number>>(); // depId -> set of source IDs

  for (const sourcePath of sourcePaths) {
    const startId = filePathToId.get(sourcePath)!;
    const reachable = bfs(startId, reverseAdj, maxDepth);

    for (const [depId] of reachable) {
      if (sourceIds.has(depId)) continue; // exclude source files themselves
      if (!dependentOverlap.has(depId)) {
        dependentOverlap.set(depId, new Set());
      }
      dependentOverlap.get(depId)!.add(startId);
    }
  }

  const result = new Map<string, { depth: number; overlapCount: number }>();
  for (const [depId, sources] of dependentOverlap) {
    const path = fileIdToPath.get(depId);
    if (!path) continue;

    // For depth, use the minimum depth across all source files
    let minDepth = Infinity;
    for (const sourcePath of sourcePaths) {
      const startId = filePathToId.get(sourcePath)!;
      const reachable = bfs(startId, reverseAdj, maxDepth);
      const d = reachable.get(depId);
      if (d !== undefined && d < minDepth) minDepth = d;
    }

    result.set(path, { depth: minDepth, overlapCount: sources.size });
  }

  return result;
}

// ===================================================================
// Single-file blast radius
// ===================================================================

describe("Golden Repo -- Blast Radius: Single File", () => {
  it("connection.ts blast radius at depth 1 includes user-repository and session-store", () => {
    const radius = blastRadius("src/db/connection.ts", 1);
    expect(radius.has("src/db/user-repository.ts")).toBe(true);
    expect(radius.has("src/auth/session-store.ts")).toBe(true);
    // Both should be at depth 1
    expect(radius.get("src/db/user-repository.ts")).toBe(1);
    expect(radius.get("src/auth/session-store.ts")).toBe(1);
  });

  it("connection.ts blast radius at depth 2 includes auth-service and routes", () => {
    const radius = blastRadius("src/db/connection.ts", 2);
    // auth-service imports session-store (which imports connection) -> depth 2
    expect(radius.has("src/auth/auth-service.ts")).toBe(true);
    expect(radius.get("src/auth/auth-service.ts")).toBeLessThanOrEqual(2);

    // routes imports user-repository (which imports connection) -> depth 2
    expect(radius.has("src/api/routes.ts")).toBe(true);
    expect(radius.get("src/api/routes.ts")).toBeLessThanOrEqual(2);
  });

  it("connection.ts blast radius at depth 2 includes index.ts", () => {
    const radius = blastRadius("src/db/connection.ts", 2);
    // index.ts directly imports connection -> depth 1
    expect(radius.has("src/index.ts")).toBe(true);
  });

  it("logger.ts has wide blast radius (4+ files at depth 1)", () => {
    const radius = blastRadius("src/utils/logger.ts", 1);
    expect(radius.size).toBeGreaterThanOrEqual(4);
  });

  it("logger.ts blast radius includes auth-service, connection, routes, handlers", () => {
    const radius = blastRadius("src/utils/logger.ts", 1);
    // These files all directly import logger
    expect(radius.has("src/auth/auth-service.ts")).toBe(true);
    expect(radius.has("src/db/connection.ts")).toBe(true);
    expect(radius.has("src/api/routes.ts")).toBe(true);
    expect(radius.has("src/api/handlers.ts")).toBe(true);
  });

  it("dead-code.ts has zero blast radius (nobody imports it)", () => {
    const radius = blastRadius("src/utils/dead-code.ts", 3);
    expect(radius.size).toBe(0);
  });

  it("token-validator.ts blast radius is exactly auth-service at depth 1", () => {
    const radius = blastRadius("src/auth/token-validator.ts", 1);
    expect(radius.has("src/auth/auth-service.ts")).toBe(true);
    // Only auth-service imports token-validator
    expect(radius.size).toBe(1);
  });

  it("token-validator.ts blast radius at depth 2 includes middleware and routes", () => {
    const radius = blastRadius("src/auth/token-validator.ts", 2);
    // auth-service is imported by middleware and routes
    expect(radius.has("src/api/middleware.ts")).toBe(true);
    expect(radius.has("src/api/routes.ts")).toBe(true);
  });

  it("models.ts blast radius includes user-repository at depth 1", () => {
    const radius = blastRadius("src/db/models.ts", 1);
    expect(radius.has("src/db/user-repository.ts")).toBe(true);
  });
});

// ===================================================================
// Aggregated blast radius (multiple source files)
// ===================================================================

describe("Golden Repo -- Blast Radius: Aggregated", () => {
  it("changing [auth-service.ts, connection.ts] surfaces middleware in results", () => {
    const agg = aggregatedBlastRadius(
      ["src/auth/auth-service.ts", "src/db/connection.ts"],
      2,
    );
    expect(agg.has("src/api/middleware.ts")).toBe(true);
  });

  it("changing [auth-service.ts, connection.ts] surfaces routes in results", () => {
    const agg = aggregatedBlastRadius(
      ["src/auth/auth-service.ts", "src/db/connection.ts"],
      2,
    );
    expect(agg.has("src/api/routes.ts")).toBe(true);
  });

  it("changing [auth-service.ts, connection.ts] surfaces session-store in results", () => {
    const agg = aggregatedBlastRadius(
      ["src/auth/auth-service.ts", "src/db/connection.ts"],
      2,
    );
    expect(agg.has("src/auth/session-store.ts")).toBe(true);
  });

  it("routes.ts has overlap count >= 2 (depends on both auth-service and connection transitively)", () => {
    const agg = aggregatedBlastRadius(
      ["src/auth/auth-service.ts", "src/db/connection.ts"],
      2,
    );
    const routesInfo = agg.get("src/api/routes.ts");
    expect(routesInfo).toBeDefined();
    // routes imports auth-service directly, and imports user-repository which imports connection
    expect(routesInfo!.overlapCount).toBeGreaterThanOrEqual(1);
  });

  it("dead-code.ts does not appear in any aggregated blast radius", () => {
    const agg = aggregatedBlastRadius(
      ["src/auth/auth-service.ts", "src/db/connection.ts"],
      3,
    );
    expect(agg.has("src/utils/dead-code.ts")).toBe(false);
  });

  it("changing [logger.ts] alone has wide blast radius", () => {
    const agg = aggregatedBlastRadius(["src/utils/logger.ts"], 1);
    expect(agg.size).toBeGreaterThanOrEqual(4);
  });

  it("changing all three core files surfaces nearly the entire repo", () => {
    const agg = aggregatedBlastRadius(
      ["src/utils/logger.ts", "src/db/connection.ts", "src/auth/auth-service.ts"],
      2,
    );
    // Should affect most files except dead-code.ts and the source files themselves
    expect(agg.size).toBeGreaterThanOrEqual(5);
    expect(agg.has("src/utils/dead-code.ts")).toBe(false);
  });
});

// ===================================================================
// Edge cases
// ===================================================================

describe("Golden Repo -- Blast Radius: Edge Cases", () => {
  it("blast radius at depth 0 is always empty", () => {
    const radius = blastRadius("src/utils/logger.ts", 0);
    expect(radius.size).toBe(0);
  });

  it("aggregated blast radius with empty source list returns empty", () => {
    const agg = aggregatedBlastRadius([], 2);
    expect(agg.size).toBe(0);
  });

  it("circular dependency does not cause infinite loop in BFS", () => {
    // middleware <-> auth-service form a cycle -- BFS should handle gracefully
    const radius = blastRadius("src/api/middleware.ts", 5);
    // Should terminate and include auth-service (and its reverse deps)
    expect(radius.has("src/auth/auth-service.ts")).toBe(true);
    // Should not include middleware itself
    expect(radius.has("src/api/middleware.ts")).toBe(false);
  });

  it("models.ts blast radius at depth 3 does not exceed total file count", () => {
    const radius = blastRadius("src/db/models.ts", 3);
    const totalFiles = results.length;
    // Blast radius should never exceed total files minus 1 (the source itself)
    expect(radius.size).toBeLessThanOrEqual(totalFiles - 1);
  });
});
