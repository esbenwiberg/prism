/**
 * Tests for circular dependency detector.
 */

import { describe, it, expect } from "vitest";
import {
  findSCCs,
  buildAdjacencyList,
  detectCircularDeps,
  type DepEdge,
} from "./circular-deps.js";

describe("findSCCs", () => {
  it("returns single-node SCCs for a DAG (no cycles)", () => {
    const adj = new Map<number, number[]>();
    adj.set(1, [2]);
    adj.set(2, [3]);
    adj.set(3, []);

    const sccs = findSCCs(adj);
    // All SCCs should have exactly 1 element
    expect(sccs.every((scc) => scc.length === 1)).toBe(true);
    expect(sccs.length).toBe(3);
  });

  it("detects a simple 2-node cycle", () => {
    const adj = new Map<number, number[]>();
    adj.set(1, [2]);
    adj.set(2, [1]);

    const sccs = findSCCs(adj);
    const multiNode = sccs.filter((scc) => scc.length > 1);
    expect(multiNode.length).toBe(1);
    expect(multiNode[0].sort()).toEqual([1, 2]);
  });

  it("detects a 3-node cycle", () => {
    const adj = new Map<number, number[]>();
    adj.set(1, [2]);
    adj.set(2, [3]);
    adj.set(3, [1]);

    const sccs = findSCCs(adj);
    const multiNode = sccs.filter((scc) => scc.length > 1);
    expect(multiNode.length).toBe(1);
    expect(multiNode[0].sort()).toEqual([1, 2, 3]);
  });

  it("detects multiple separate cycles", () => {
    const adj = new Map<number, number[]>();
    // Cycle 1: 1 <-> 2
    adj.set(1, [2]);
    adj.set(2, [1]);
    // Cycle 2: 3 <-> 4
    adj.set(3, [4]);
    adj.set(4, [3]);

    const sccs = findSCCs(adj);
    const multiNode = sccs.filter((scc) => scc.length > 1);
    expect(multiNode.length).toBe(2);
  });

  it("handles a self-loop", () => {
    const adj = new Map<number, number[]>();
    adj.set(1, [1]);

    const sccs = findSCCs(adj);
    // Self-loop forms an SCC of size 1, but it's still just one node
    expect(sccs.length).toBe(1);
    expect(sccs[0]).toEqual([1]);
  });

  it("handles empty graph", () => {
    const adj = new Map<number, number[]>();
    const sccs = findSCCs(adj);
    expect(sccs).toEqual([]);
  });

  it("handles disconnected nodes", () => {
    const adj = new Map<number, number[]>();
    adj.set(1, []);
    adj.set(2, []);
    adj.set(3, []);

    const sccs = findSCCs(adj);
    expect(sccs.length).toBe(3);
    expect(sccs.every((scc) => scc.length === 1)).toBe(true);
  });

  it("handles complex graph with multiple SCCs and bridges", () => {
    const adj = new Map<number, number[]>();
    // SCC: {1, 2, 3}
    adj.set(1, [2]);
    adj.set(2, [3]);
    adj.set(3, [1, 4]); // bridge to node 4
    // SCC: {4, 5}
    adj.set(4, [5]);
    adj.set(5, [4]);

    const sccs = findSCCs(adj);
    const multiNode = sccs.filter((scc) => scc.length > 1);
    expect(multiNode.length).toBe(2);

    const sorted = multiNode.map((scc) => scc.sort());
    const hasTriple = sorted.some(
      (scc) => scc.length === 3 && scc[0] === 1 && scc[1] === 2 && scc[2] === 3,
    );
    const hasPair = sorted.some(
      (scc) => scc.length === 2 && scc[0] === 4 && scc[1] === 5,
    );
    expect(hasTriple).toBe(true);
    expect(hasPair).toBe(true);
  });
});

describe("buildAdjacencyList", () => {
  it("builds adjacency list from edges", () => {
    const edges: DepEdge[] = [
      { sourceFileId: 1, targetFileId: 2 },
      { sourceFileId: 2, targetFileId: 3 },
      { sourceFileId: 1, targetFileId: 3 },
    ];

    const adj = buildAdjacencyList(edges);
    expect(adj.get(1)).toEqual([2, 3]);
    expect(adj.get(2)).toEqual([3]);
    expect(adj.get(3)).toEqual([]);
  });

  it("handles empty edges", () => {
    const adj = buildAdjacencyList([]);
    expect(adj.size).toBe(0);
  });
});

describe("detectCircularDeps", () => {
  it("returns empty findings for a DAG", () => {
    const edges: DepEdge[] = [
      { sourceFileId: 1, targetFileId: 2 },
      { sourceFileId: 2, targetFileId: 3 },
    ];
    const fileIdToPath = new Map([
      [1, "src/a.ts"],
      [2, "src/b.ts"],
      [3, "src/c.ts"],
    ]);

    const findings = detectCircularDeps(edges, fileIdToPath);
    expect(findings).toEqual([]);
  });

  it("detects a simple cycle and creates a finding", () => {
    const edges: DepEdge[] = [
      { sourceFileId: 1, targetFileId: 2 },
      { sourceFileId: 2, targetFileId: 1 },
    ];
    const fileIdToPath = new Map([
      [1, "src/a.ts"],
      [2, "src/b.ts"],
    ]);

    const findings = detectCircularDeps(edges, fileIdToPath);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe("circular-dep");
    expect(findings[0].severity).toBe("low"); // 2 files = low
    expect(findings[0].title).toContain("2 files");
  });

  it("assigns medium severity for 3-5 file cycles", () => {
    const edges: DepEdge[] = [
      { sourceFileId: 1, targetFileId: 2 },
      { sourceFileId: 2, targetFileId: 3 },
      { sourceFileId: 3, targetFileId: 1 },
    ];
    const fileIdToPath = new Map([
      [1, "src/a.ts"],
      [2, "src/b.ts"],
      [3, "src/c.ts"],
    ]);

    const findings = detectCircularDeps(edges, fileIdToPath);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("medium");
  });

  it("assigns high severity for cycles > 5 files", () => {
    // Create a 6-node cycle: 1->2->3->4->5->6->1
    const edges: DepEdge[] = [
      { sourceFileId: 1, targetFileId: 2 },
      { sourceFileId: 2, targetFileId: 3 },
      { sourceFileId: 3, targetFileId: 4 },
      { sourceFileId: 4, targetFileId: 5 },
      { sourceFileId: 5, targetFileId: 6 },
      { sourceFileId: 6, targetFileId: 1 },
    ];
    const fileIdToPath = new Map([
      [1, "src/a.ts"],
      [2, "src/b.ts"],
      [3, "src/c.ts"],
      [4, "src/d.ts"],
      [5, "src/e.ts"],
      [6, "src/f.ts"],
    ]);

    const findings = detectCircularDeps(edges, fileIdToPath);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("high");
  });

  it("uses fallback label when file path is unknown", () => {
    const edges: DepEdge[] = [
      { sourceFileId: 1, targetFileId: 2 },
      { sourceFileId: 2, targetFileId: 1 },
    ];
    const fileIdToPath = new Map<number, string>();

    const findings = detectCircularDeps(edges, fileIdToPath);
    expect(findings.length).toBe(1);
    expect(findings[0].description).toContain("file#");
  });

  it("returns empty findings for empty input", () => {
    const findings = detectCircularDeps([], new Map());
    expect(findings).toEqual([]);
  });
});
