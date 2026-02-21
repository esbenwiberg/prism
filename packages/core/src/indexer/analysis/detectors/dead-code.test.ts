/**
 * Tests for dead code detector.
 */

import { describe, it, expect } from "vitest";
import { detectDeadCode, type SymbolInfo, type SymbolReference } from "./dead-code.js";

describe("detectDeadCode", () => {
  const fileIdToPath = new Map([
    [1, "src/a.ts"],
    [2, "src/b.ts"],
    [3, "src/c.ts"],
  ]);

  it("returns empty findings when all exports are referenced", () => {
    const symbols: SymbolInfo[] = [
      { id: 10, fileId: 1, name: "foo", kind: "function", exported: true },
      { id: 11, fileId: 2, name: "bar", kind: "function", exported: true },
    ];
    const references: SymbolReference[] = [
      { sourceFileId: 2, targetSymbolId: 10 },
      { sourceFileId: 1, targetSymbolId: 11 },
    ];

    const findings = detectDeadCode(symbols, references, fileIdToPath);
    expect(findings).toEqual([]);
  });

  it("detects exported symbols with no references", () => {
    const symbols: SymbolInfo[] = [
      { id: 10, fileId: 1, name: "foo", kind: "function", exported: true },
      { id: 11, fileId: 1, name: "bar", kind: "function", exported: true },
    ];
    const references: SymbolReference[] = [];

    const findings = detectDeadCode(symbols, references, fileIdToPath);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe("dead-code");
    expect(findings[0].title).toContain("2 unused exports");
    expect(findings[0].description).toContain("foo");
    expect(findings[0].description).toContain("bar");
  });

  it("ignores non-exported symbols", () => {
    const symbols: SymbolInfo[] = [
      { id: 10, fileId: 1, name: "internal", kind: "function", exported: false },
    ];
    const references: SymbolReference[] = [];

    const findings = detectDeadCode(symbols, references, fileIdToPath);
    expect(findings).toEqual([]);
  });

  it("groups findings by file", () => {
    const symbols: SymbolInfo[] = [
      { id: 10, fileId: 1, name: "foo", kind: "function", exported: true },
      { id: 11, fileId: 2, name: "bar", kind: "class", exported: true },
    ];
    const references: SymbolReference[] = [];

    const findings = detectDeadCode(symbols, references, fileIdToPath);
    expect(findings.length).toBe(2);
    expect(findings.map((f) => f.title)).toContain(
      "1 unused export in src/a.ts",
    );
    expect(findings.map((f) => f.title)).toContain(
      "1 unused export in src/b.ts",
    );
  });

  it("assigns medium severity when > 5 unused exports in a file", () => {
    const symbols: SymbolInfo[] = Array.from({ length: 6 }, (_, i) => ({
      id: i + 10,
      fileId: 1,
      name: `sym${i}`,
      kind: "function",
      exported: true,
    }));
    const references: SymbolReference[] = [];

    const findings = detectDeadCode(symbols, references, fileIdToPath);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("medium");
  });

  it("assigns low severity when <= 5 unused exports in a file", () => {
    const symbols: SymbolInfo[] = [
      { id: 10, fileId: 1, name: "foo", kind: "function", exported: true },
    ];
    const references: SymbolReference[] = [];

    const findings = detectDeadCode(symbols, references, fileIdToPath);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("low");
  });

  it("excludes referenced symbols even when others in same file are dead", () => {
    const symbols: SymbolInfo[] = [
      { id: 10, fileId: 1, name: "used", kind: "function", exported: true },
      { id: 11, fileId: 1, name: "unused", kind: "function", exported: true },
    ];
    const references: SymbolReference[] = [
      { sourceFileId: 2, targetSymbolId: 10 },
    ];

    const findings = detectDeadCode(symbols, references, fileIdToPath);
    expect(findings.length).toBe(1);
    expect(findings[0].description).toContain("unused");
    expect(findings[0].description).not.toContain("used,");
  });

  it("handles empty inputs", () => {
    const findings = detectDeadCode([], [], new Map());
    expect(findings).toEqual([]);
  });

  it("uses fallback label for unknown file IDs", () => {
    const symbols: SymbolInfo[] = [
      { id: 10, fileId: 999, name: "orphan", kind: "function", exported: true },
    ];

    const findings = detectDeadCode(symbols, [], new Map());
    expect(findings.length).toBe(1);
    expect(findings[0].title).toContain("file#999");
  });

  it("includes evidence with symbol details", () => {
    const symbols: SymbolInfo[] = [
      { id: 10, fileId: 1, name: "foo", kind: "function", exported: true },
    ];

    const findings = detectDeadCode(symbols, [], fileIdToPath);
    const evidence = findings[0].evidence as {
      fileId: number;
      filePath: string;
      symbols: Array<{ id: number; name: string; kind: string }>;
      count: number;
    };
    expect(evidence.fileId).toBe(1);
    expect(evidence.filePath).toBe("src/a.ts");
    expect(evidence.symbols).toEqual([{ id: 10, name: "foo", kind: "function" }]);
    expect(evidence.count).toBe(1);
  });
});
