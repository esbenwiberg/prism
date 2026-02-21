/**
 * Tests for the AST-aware chunker.
 */

import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  extractSymbolSource,
  buildFileContext,
  chunkFileSymbols,
  filterSummarisableSymbols,
} from "./chunker.js";
import type { ExtractedSymbol } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSymbol(
  overrides: Partial<ExtractedSymbol> = {},
): ExtractedSymbol {
  return {
    kind: "function",
    name: "testFn",
    startLine: 1,
    endLine: 5,
    exported: true,
    signature: "function testFn(): void",
    docstring: null,
    complexity: null,
    ...overrides,
  };
}

const SAMPLE_FILE = [
  "import { foo } from './foo';",       // line 1
  "",                                    // line 2
  "export function greet(name: string) {", // line 3
  "  return `Hello ${name}`;",           // line 4
  "}",                                   // line 5
  "",                                    // line 6
  "export class Greeter {",              // line 7
  "  greet(name: string) {",            // line 8
  "    return `Hello ${name}`;",         // line 9
  "  }",                                 // line 10
  "}",                                   // line 11
].join("\n");

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe("estimateTokens", () => {
  it("estimates tokens from character count", () => {
    // 20 chars / 4 = 5 tokens
    expect(estimateTokens("12345678901234567890")).toBe(5);
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("rounds up fractional tokens", () => {
    // 5 chars / 4 = 1.25, rounds up to 2
    expect(estimateTokens("hello")).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// extractSymbolSource
// ---------------------------------------------------------------------------

describe("extractSymbolSource", () => {
  it("extracts the correct lines for a symbol", () => {
    const sym = makeSymbol({ startLine: 3, endLine: 5 });
    const source = extractSymbolSource(SAMPLE_FILE, sym);
    expect(source).toBe(
      "export function greet(name: string) {\n  return `Hello ${name}`;\n}",
    );
  });

  it("handles single-line symbol", () => {
    const sym = makeSymbol({ startLine: 1, endLine: 1 });
    const source = extractSymbolSource(SAMPLE_FILE, sym);
    expect(source).toBe("import { foo } from './foo';");
  });

  it("handles null start/end lines gracefully", () => {
    const sym = makeSymbol({ startLine: null as unknown as number, endLine: null as unknown as number });
    // Should return the entire file (fallback)
    const source = extractSymbolSource(SAMPLE_FILE, sym);
    expect(source.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// buildFileContext
// ---------------------------------------------------------------------------

describe("buildFileContext", () => {
  const symbols: ExtractedSymbol[] = [
    makeSymbol({ name: "greet", kind: "function", exported: true, signature: "function greet(name: string): string" }),
    makeSymbol({ name: "Greeter", kind: "class", exported: true, signature: "class Greeter" }),
    makeSymbol({ name: "helper", kind: "function", exported: false, signature: "function helper(): void" }),
  ];

  it("returns signatures of other exported symbols", () => {
    const context = buildFileContext(SAMPLE_FILE, symbols, symbols[0]);
    expect(context).toContain("class Greeter");
    expect(context).not.toContain("function greet"); // current symbol excluded
  });

  it("excludes non-exported symbols", () => {
    const context = buildFileContext(SAMPLE_FILE, symbols, symbols[0]);
    expect(context).not.toContain("helper");
  });

  it("respects token budget", () => {
    const context = buildFileContext(SAMPLE_FILE, symbols, symbols[0], 1);
    // Very small budget, should only include first eligible item or nothing
    const lines = context.split("\n").filter(Boolean);
    expect(lines.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// chunkFileSymbols
// ---------------------------------------------------------------------------

describe("chunkFileSymbols", () => {
  const symbols: ExtractedSymbol[] = [
    makeSymbol({ name: "greet", kind: "function", startLine: 3, endLine: 5 }),
    makeSymbol({ name: "Greeter", kind: "class", startLine: 7, endLine: 11 }),
    makeSymbol({ name: "SomeImport", kind: "import", startLine: 1, endLine: 1 }),
    makeSymbol({ name: "SomeType", kind: "type", startLine: 6, endLine: 6 }),
  ];

  it("only chunks summarisable symbols (function, class, interface, enum)", () => {
    const chunks = chunkFileSymbols(SAMPLE_FILE, symbols);
    expect(chunks.length).toBe(2);
    expect(chunks[0].symbolName).toBe("greet");
    expect(chunks[1].symbolName).toBe("Greeter");
  });

  it("includes estimated token count", () => {
    const chunks = chunkFileSymbols(SAMPLE_FILE, symbols);
    for (const chunk of chunks) {
      expect(chunk.estimatedTokens).toBeGreaterThan(0);
    }
  });

  it("truncates source code that exceeds token limit", () => {
    // Create a symbol with very long content
    const longContent = "x".repeat(50000); // Way beyond default limit
    const longSymbol = makeSymbol({
      name: "bigFn",
      kind: "function",
      startLine: 1,
      endLine: 1,
    });
    const chunks = chunkFileSymbols(longContent, [longSymbol], 100);
    expect(chunks.length).toBe(1);
    expect(chunks[0].sourceCode).toContain("[truncated]");
    expect(chunks[0].estimatedTokens).toBeLessThanOrEqual(100);
  });

  it("returns empty array for no symbols", () => {
    const chunks = chunkFileSymbols(SAMPLE_FILE, []);
    expect(chunks.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// filterSummarisableSymbols
// ---------------------------------------------------------------------------

describe("filterSummarisableSymbols", () => {
  it("keeps function, class, interface, enum", () => {
    const symbols: ExtractedSymbol[] = [
      makeSymbol({ kind: "function" }),
      makeSymbol({ kind: "class" }),
      makeSymbol({ kind: "interface" }),
      makeSymbol({ kind: "enum" }),
      makeSymbol({ kind: "import" }),
      makeSymbol({ kind: "export" }),
      makeSymbol({ kind: "type" }),
    ];
    const filtered = filterSummarisableSymbols(symbols);
    expect(filtered.length).toBe(4);
    expect(filtered.map((s) => s.kind)).toEqual([
      "function",
      "class",
      "interface",
      "enum",
    ]);
  });
});
