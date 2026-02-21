/**
 * Tests for god-module detector.
 */

import { describe, it, expect } from "vitest";
import { detectGodModules, type FileMetricsInput } from "./god-modules.js";

describe("detectGodModules", () => {
  it("returns empty findings when no file exceeds thresholds", () => {
    const files: FileMetricsInput[] = [
      { fileId: 1, filePath: "src/a.ts", fanOut: 3, fanIn: 2, symbolCount: 5, lineCount: 100 },
      { fileId: 2, filePath: "src/b.ts", fanOut: 1, fanIn: 1, symbolCount: 3, lineCount: 50 },
    ];

    const findings = detectGodModules(files);
    expect(findings).toEqual([]);
  });

  it("detects a file with high fan-in AND fan-out", () => {
    const files: FileMetricsInput[] = [
      {
        fileId: 1,
        filePath: "src/god.ts",
        fanOut: 10,
        fanIn: 12,
        symbolCount: 30,
        lineCount: 500,
      },
    ];

    const findings = detectGodModules(files);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe("god-module");
    expect(findings[0].title).toContain("src/god.ts");
    expect(findings[0].description).toContain("12 incoming");
    expect(findings[0].description).toContain("10 outgoing");
  });

  it("does NOT flag files with high fan-in but low fan-out", () => {
    const files: FileMetricsInput[] = [
      { fileId: 1, filePath: "src/types.ts", fanOut: 2, fanIn: 20, symbolCount: 10, lineCount: 200 },
    ];

    const findings = detectGodModules(files);
    expect(findings).toEqual([]);
  });

  it("does NOT flag files with high fan-out but low fan-in", () => {
    const files: FileMetricsInput[] = [
      { fileId: 1, filePath: "src/main.ts", fanOut: 15, fanIn: 0, symbolCount: 5, lineCount: 100 },
    ];

    const findings = detectGodModules(files);
    expect(findings).toEqual([]);
  });

  it("respects custom thresholds", () => {
    const files: FileMetricsInput[] = [
      { fileId: 1, filePath: "src/hub.ts", fanOut: 5, fanIn: 6, symbolCount: 10, lineCount: 150 },
    ];

    // Default thresholds would not flag this
    expect(detectGodModules(files)).toEqual([]);

    // Lower thresholds should flag it
    const findings = detectGodModules(files, {
      minFanIn: 5,
      minFanOut: 5,
      minCombined: 10,
    });
    expect(findings.length).toBe(1);
  });

  it("assigns severity based on combined coupling", () => {
    const makeFile = (fanIn: number, fanOut: number): FileMetricsInput[] => [
      { fileId: 1, filePath: "src/x.ts", fanIn, fanOut, symbolCount: 10, lineCount: 200 },
    ];

    // combined 22 -> low
    const low = detectGodModules(makeFile(10, 12));
    expect(low.length).toBe(1);
    expect(low[0].severity).toBe("low");

    // combined 32 -> medium
    const medium = detectGodModules(makeFile(16, 16));
    expect(medium.length).toBe(1);
    expect(medium[0].severity).toBe("medium");

    // combined 50 -> high
    const high = detectGodModules(makeFile(25, 25));
    expect(high.length).toBe(1);
    expect(high[0].severity).toBe("high");
  });

  it("includes evidence in findings", () => {
    const files: FileMetricsInput[] = [
      { fileId: 42, filePath: "src/big.ts", fanOut: 10, fanIn: 15, symbolCount: 20, lineCount: 300 },
    ];

    const findings = detectGodModules(files);
    const evidence = findings[0].evidence as Record<string, unknown>;
    expect(evidence.fileId).toBe(42);
    expect(evidence.filePath).toBe("src/big.ts");
    expect(evidence.fanIn).toBe(15);
    expect(evidence.fanOut).toBe(10);
    expect(evidence.combined).toBe(25);
  });

  it("handles empty input", () => {
    expect(detectGodModules([])).toEqual([]);
  });
});
