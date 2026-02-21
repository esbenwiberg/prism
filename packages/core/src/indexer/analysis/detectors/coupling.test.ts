/**
 * Tests for coupling/cohesion detector.
 */

import { describe, it, expect } from "vitest";
import { detectCouplingIssues, type CouplingMetricsInput } from "./coupling.js";

describe("detectCouplingIssues", () => {
  it("returns empty findings when all files are within thresholds", () => {
    const files: CouplingMetricsInput[] = [
      {
        fileId: 1,
        filePath: "src/a.ts",
        efferentCoupling: 5,
        afferentCoupling: 3,
        cohesion: 0.5,
        totalCoupling: 8,
      },
    ];

    const findings = detectCouplingIssues(files);
    expect(findings).toEqual([]);
  });

  it("detects high efferent coupling", () => {
    const files: CouplingMetricsInput[] = [
      {
        fileId: 1,
        filePath: "src/hub.ts",
        efferentCoupling: 20,
        afferentCoupling: 2,
        cohesion: 0.5,
        totalCoupling: 22,
      },
    ];

    const findings = detectCouplingIssues(files);
    const efferent = findings.filter((f) => f.title.includes("efferent"));
    expect(efferent.length).toBe(1);
    expect(efferent[0].description).toContain("20 other files");
  });

  it("detects high afferent coupling", () => {
    const files: CouplingMetricsInput[] = [
      {
        fileId: 1,
        filePath: "src/types.ts",
        efferentCoupling: 1,
        afferentCoupling: 25,
        cohesion: 0.8,
        totalCoupling: 26,
      },
    ];

    const findings = detectCouplingIssues(files);
    const afferent = findings.filter((f) => f.title.includes("afferent"));
    expect(afferent.length).toBe(1);
    expect(afferent[0].description).toContain("25 other files");
  });

  it("detects low cohesion", () => {
    const files: CouplingMetricsInput[] = [
      {
        fileId: 1,
        filePath: "src/misc.ts",
        efferentCoupling: 3,
        afferentCoupling: 2,
        cohesion: 0.1,
        totalCoupling: 5,
      },
    ];

    const findings = detectCouplingIssues(files);
    const cohesionFindings = findings.filter((f) => f.title.includes("cohesion"));
    expect(cohesionFindings.length).toBe(1);
    expect(cohesionFindings[0].severity).toBe("low");
  });

  it("detects excessive total coupling", () => {
    const files: CouplingMetricsInput[] = [
      {
        fileId: 1,
        filePath: "src/central.ts",
        efferentCoupling: 14,
        afferentCoupling: 14,
        cohesion: 0.5,
        totalCoupling: 28,
      },
    ];

    const findings = detectCouplingIssues(files);
    const total = findings.filter((f) => f.title.includes("total"));
    expect(total.length).toBe(1);
    expect(total[0].description).toContain("28");
  });

  it("respects custom thresholds", () => {
    const files: CouplingMetricsInput[] = [
      {
        fileId: 1,
        filePath: "src/x.ts",
        efferentCoupling: 5,
        afferentCoupling: 5,
        cohesion: 0.4,
        totalCoupling: 10,
      },
    ];

    // Default thresholds should not flag this
    expect(detectCouplingIssues(files)).toEqual([]);

    // Lower thresholds should flag efferent coupling
    const findings = detectCouplingIssues(files, {
      maxEfferentCoupling: 4,
      maxAfferentCoupling: 4,
      maxTotalCoupling: 8,
    });
    expect(findings.length).toBeGreaterThan(0);
  });

  it("assigns higher severity when thresholds are exceeded by 2x", () => {
    const files: CouplingMetricsInput[] = [
      {
        fileId: 1,
        filePath: "src/mega.ts",
        efferentCoupling: 35, // 2x+ of default 15
        afferentCoupling: 45, // 2x+ of default 20
        cohesion: 0.5,
        totalCoupling: 80,
      },
    ];

    const findings = detectCouplingIssues(files);
    const highSeverity = findings.filter((f) => f.severity === "high");
    expect(highSeverity.length).toBeGreaterThan(0);
  });

  it("handles empty input", () => {
    expect(detectCouplingIssues([])).toEqual([]);
  });

  it("does not flag cohesion for negative values", () => {
    const files: CouplingMetricsInput[] = [
      {
        fileId: 1,
        filePath: "src/x.ts",
        efferentCoupling: 1,
        afferentCoupling: 1,
        cohesion: -1,
        totalCoupling: 2,
      },
    ];

    const findings = detectCouplingIssues(files);
    expect(findings).toEqual([]);
  });
});
