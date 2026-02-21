/**
 * Tests for the LLM summariser.
 *
 * API calls are mocked — these tests verify prompt construction,
 * input hash computation, cost calculation, and budget tracking.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  buildPrompt,
  computeInputHash,
  computeCost,
  resetPromptTemplate,
} from "./summarizer.js";
import type { SummariseInput } from "./summarizer.js";
import type { ExtractedSymbol } from "../types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSymbol(
  overrides: Partial<ExtractedSymbol> = {},
): ExtractedSymbol {
  return {
    kind: "function",
    name: "processData",
    startLine: 5,
    endLine: 15,
    exported: true,
    signature: "function processData(input: Data): Result",
    docstring: null,
    complexity: 3,
    ...overrides,
  };
}

function makeSummariseInput(
  overrides: Partial<SummariseInput> = {},
): SummariseInput {
  const fileContent = [
    "import { Data, Result } from './types';",
    "",
    "const helper = () => {};",
    "",
    "export function processData(input: Data): Result {",
    "  const validated = validate(input);",
    "  const transformed = transform(validated);",
    "  return { success: true, data: transformed };",
    "}",
    "",
    "export function validate(input: Data): Data {",
    "  return input;",
    "}",
  ].join("\n");

  const allSymbols: ExtractedSymbol[] = [
    makeSymbol(),
    makeSymbol({
      name: "validate",
      startLine: 11,
      endLine: 13,
      signature: "function validate(input: Data): Data",
    }),
  ];

  return {
    filePath: "src/processor.ts",
    language: "typescript",
    fileContent,
    symbol: allSymbols[0],
    allSymbols,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildPrompt
// ---------------------------------------------------------------------------

describe("buildPrompt", () => {
  beforeEach(() => {
    resetPromptTemplate();
  });

  it("includes file path and symbol name in the prompt", () => {
    const input = makeSummariseInput();
    // Use a simple template to test substitution
    const template =
      "File: {{filePath}}\nSymbol: {{symbolName}} ({{symbolKind}})\n```{{language}}\n{{sourceCode}}\n```";
    const prompt = buildPrompt(input, template);

    expect(prompt).toContain("File: src/processor.ts");
    expect(prompt).toContain("Symbol: processData (function)");
    expect(prompt).toContain("```typescript");
    expect(prompt).toContain("export function processData");
  });

  it("includes docstring when present", () => {
    const input = makeSummariseInput({
      symbol: makeSymbol({ docstring: "Processes raw data into results." }),
    });
    const template =
      "{{#if docstring}}Docstring: {{docstring}}{{/if}}\n{{sourceCode}}";
    const prompt = buildPrompt(input, template);

    expect(prompt).toContain("Docstring: Processes raw data into results.");
  });

  it("removes docstring block when not present", () => {
    const input = makeSummariseInput({
      symbol: makeSymbol({ docstring: null }),
    });
    const template =
      "Start\n{{#if docstring}}Docstring: {{docstring}}{{/if}}\nEnd\n{{sourceCode}}";
    const prompt = buildPrompt(input, template);

    expect(prompt).not.toContain("Docstring:");
    expect(prompt).toContain("Start");
    expect(prompt).toContain("End");
  });

  it("includes file context when present", () => {
    const input = makeSummariseInput();
    const template =
      "{{sourceCode}}\n{{#if fileContext}}Context:\n{{fileContext}}{{/if}}";
    const prompt = buildPrompt(input, template);

    // validate is an exported symbol, should appear in context
    expect(prompt).toContain("function validate(input: Data): Data");
  });

  it("replaces start/end line placeholders", () => {
    const input = makeSummariseInput();
    const template = "Lines: {{startLine}}-{{endLine}}";
    const prompt = buildPrompt(input, template);

    expect(prompt).toBe("Lines: 5-15");
  });
});

// ---------------------------------------------------------------------------
// computeInputHash
// ---------------------------------------------------------------------------

describe("computeInputHash", () => {
  it("returns a 64-character hex SHA-256 hash", () => {
    const hash = computeInputHash("test prompt");
    expect(hash.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it("returns the same hash for the same input", () => {
    const hash1 = computeInputHash("same input");
    const hash2 = computeInputHash("same input");
    expect(hash1).toBe(hash2);
  });

  it("returns different hashes for different inputs", () => {
    const hash1 = computeInputHash("input A");
    const hash2 = computeInputHash("input B");
    expect(hash1).not.toBe(hash2);
  });
});

// ---------------------------------------------------------------------------
// computeCost
// ---------------------------------------------------------------------------

describe("computeCost", () => {
  it("computes cost from input and output tokens", () => {
    const cost = computeCost(1000, 100);
    // 1000 * 0.0000008 + 100 * 0.000004 = 0.0008 + 0.0004 = 0.0012
    expect(cost).toBeCloseTo(0.0012, 6);
  });

  it("returns 0 for zero tokens", () => {
    expect(computeCost(0, 0)).toBe(0);
  });

  it("handles large token counts", () => {
    const cost = computeCost(1_000_000, 100_000);
    // 1M * 0.0000008 + 100K * 0.000004 = 0.8 + 0.4 = 1.2
    expect(cost).toBeCloseTo(1.2, 4);
  });
});
