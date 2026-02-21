/**
 * Tests for code metrics computation.
 */

import { describe, it, expect, beforeAll } from "vitest";
import Parser from "web-tree-sitter";
import { computeComplexity, computeFileMetrics } from "./metrics.js";
import { getGrammarPath } from "./languages.js";
import type { DependencyEdge, ExtractedSymbol } from "../types.js";

let tsLang: Parser.Language;

beforeAll(async () => {
  await Parser.init();
  tsLang = await Parser.Language.load(getGrammarPath("typescript"));
});

function parse(source: string, lang: Parser.Language): Parser.Tree {
  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(source);
  parser.delete();
  return tree;
}

describe("computeComplexity", () => {
  it("returns 1 for a simple function with no branches", () => {
    const source = `function simple() { return 1; }`;
    const tree = parse(source, tsLang);
    const complexity = computeComplexity(tree.rootNode, "typescript");
    tree.delete();
    expect(complexity).toBe(1);
  });

  it("increments for if statements", () => {
    const source = `function check(x: number) {
  if (x > 0) {
    return "positive";
  } else {
    return "non-positive";
  }
}`;
    const tree = parse(source, tsLang);
    const complexity = computeComplexity(tree.rootNode, "typescript");
    tree.delete();
    // 1 base + 1 if + 1 else = 3
    expect(complexity).toBe(3);
  });

  it("increments for loops", () => {
    const source = `function loop() {
  for (let i = 0; i < 10; i++) {
    while (true) {
      break;
    }
  }
}`;
    const tree = parse(source, tsLang);
    const complexity = computeComplexity(tree.rootNode, "typescript");
    tree.delete();
    // 1 base + 1 for + 1 while = 3
    expect(complexity).toBe(3);
  });

  it("increments for logical operators", () => {
    const source = `function test(a: boolean, b: boolean) {
  if (a && b || !a) {
    return true;
  }
  return false;
}`;
    const tree = parse(source, tsLang);
    const complexity = computeComplexity(tree.rootNode, "typescript");
    tree.delete();
    // 1 base + 1 if + 1 && + 1 || = 4
    expect(complexity).toBe(4);
  });

  it("increments for ternary expressions", () => {
    const source = `const x = true ? 1 : 0;`;
    const tree = parse(source, tsLang);
    const complexity = computeComplexity(tree.rootNode, "typescript");
    tree.delete();
    // 1 base + 1 ternary = 2
    expect(complexity).toBe(2);
  });
});

describe("computeFileMetrics", () => {
  it("computes efferent coupling from edges", () => {
    const edges: DependencyEdge[] = [
      { sourceFile: "a.ts", importSpecifier: "./b", targetFile: "b.ts", kind: "import" },
      { sourceFile: "a.ts", importSpecifier: "./c", targetFile: "c.ts", kind: "import" },
    ];
    const symbols: ExtractedSymbol[] = [
      { kind: "function", name: "foo", startLine: 1, endLine: 3, exported: true, signature: null, docstring: null, complexity: null },
      { kind: "function", name: "bar", startLine: 5, endLine: 7, exported: true, signature: null, docstring: null, complexity: null },
    ];

    const metrics = computeFileMetrics("a.ts", edges, edges, symbols);
    expect(metrics.efferentCoupling).toBe(2);
  });

  it("computes afferent coupling from all edges", () => {
    const allEdges: DependencyEdge[] = [
      { sourceFile: "b.ts", importSpecifier: "./a", targetFile: "a.ts", kind: "import" },
      { sourceFile: "c.ts", importSpecifier: "./a", targetFile: "a.ts", kind: "import" },
      { sourceFile: "d.ts", importSpecifier: "./a", targetFile: "a.ts", kind: "import" },
    ];
    const fileEdges: DependencyEdge[] = [];
    const symbols: ExtractedSymbol[] = [
      { kind: "function", name: "foo", startLine: 1, endLine: 3, exported: true, signature: null, docstring: null, complexity: null },
    ];

    const metrics = computeFileMetrics("a.ts", fileEdges, allEdges, symbols);
    expect(metrics.afferentCoupling).toBe(3);
  });

  it("computes cohesion as a ratio", () => {
    const edges: DependencyEdge[] = [];
    const symbols: ExtractedSymbol[] = [
      { kind: "function", name: "foo", startLine: 1, endLine: 3, exported: true, signature: null, docstring: null, complexity: null },
      { kind: "function", name: "bar", startLine: 5, endLine: 7, exported: true, signature: null, docstring: null, complexity: null },
    ];

    const metrics = computeFileMetrics("a.ts", edges, edges, symbols);
    // No external deps, 2 symbols => cohesion = 1 - 0/2 = 1
    expect(metrics.cohesion).toBe(1);
  });
});
