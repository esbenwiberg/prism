/**
 * Tests for blueprint splitter.
 */

import { describe, it, expect } from "vitest";
import { splitBySubsystem } from "./splitter.js";
import type { FindingRow } from "@prism/core";
import type { SummaryRow } from "@prism/core";

// Helper to create a mock FindingRow
function mockFinding(overrides: Partial<FindingRow> = {}): FindingRow {
  return {
    id: 1,
    projectId: 1,
    category: "coupling",
    severity: "medium",
    title: "Test finding",
    description: "Test description",
    evidence: null,
    suggestion: null,
    createdAt: new Date(),
    ...overrides,
  };
}

// Helper to create a mock SummaryRow
function mockSummary(overrides: Partial<SummaryRow> = {}): SummaryRow {
  return {
    id: 1,
    projectId: 1,
    level: "module",
    targetId: "module:src",
    content: "Test summary",
    model: null,
    inputHash: null,
    costUsd: null,
    ...overrides,
  };
}

describe("splitBySubsystem", () => {
  it("groups findings by module path from evidence", () => {
    const findings: FindingRow[] = [
      mockFinding({
        id: 1,
        evidence: { filePath: "src/auth/login.ts" },
      }),
      mockFinding({
        id: 2,
        evidence: { filePath: "src/auth/session.ts" },
      }),
      mockFinding({
        id: 3,
        evidence: { filePath: "src/db/connection.ts" },
      }),
    ];

    const summaries: SummaryRow[] = [
      mockSummary({ targetId: "module:src/auth" }),
      mockSummary({ targetId: "module:src/db" }),
    ];

    const groups = splitBySubsystem(findings, summaries);
    expect(groups.length).toBe(2);

    const authGroup = groups.find((g) => g.name === "src/auth");
    const dbGroup = groups.find((g) => g.name === "src/db");

    expect(authGroup).toBeDefined();
    expect(authGroup!.findings.length).toBe(2);
    expect(dbGroup).toBeDefined();
    expect(dbGroup!.findings.length).toBe(1);
  });

  it("places findings without file path in general group", () => {
    const findings: FindingRow[] = [
      mockFinding({ id: 1, evidence: null }),
      mockFinding({ id: 2, evidence: { someOtherField: true } }),
    ];

    const groups = splitBySubsystem(findings, []);
    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe("general");
    expect(groups[0].findings.length).toBe(2);
  });

  it("sorts groups by finding count descending", () => {
    const findings: FindingRow[] = [
      mockFinding({ id: 1, evidence: { filePath: "src/a/x.ts" } }),
      mockFinding({ id: 2, evidence: { filePath: "src/b/x.ts" } }),
      mockFinding({ id: 3, evidence: { filePath: "src/b/y.ts" } }),
      mockFinding({ id: 4, evidence: { filePath: "src/b/z.ts" } }),
    ];

    const summaries: SummaryRow[] = [
      mockSummary({ targetId: "module:src/a" }),
      mockSummary({ targetId: "module:src/b" }),
    ];

    const groups = splitBySubsystem(findings, summaries);
    expect(groups[0].name).toBe("src/b");
    expect(groups[0].findings.length).toBe(3);
  });

  it("matches module summaries to groups", () => {
    const findings: FindingRow[] = [
      mockFinding({ id: 1, evidence: { filePath: "src/auth/login.ts" } }),
    ];

    const summaries: SummaryRow[] = [
      mockSummary({ targetId: "module:src/auth", content: "Auth module summary" }),
      mockSummary({ targetId: "module:src/db", content: "DB module summary" }),
    ];

    const groups = splitBySubsystem(findings, summaries);
    expect(groups.length).toBe(1);
    expect(groups[0].moduleSummaries.length).toBe(1);
    expect(groups[0].moduleSummaries[0].content).toBe("Auth module summary");
  });

  it("handles empty inputs", () => {
    const groups = splitBySubsystem([], []);
    expect(groups).toEqual([]);
  });

  it("extracts file path from sourceFilePath in evidence", () => {
    const findings: FindingRow[] = [
      mockFinding({
        id: 1,
        evidence: { sourceFilePath: "src/routes/api.ts" },
      }),
    ];

    const summaries: SummaryRow[] = [
      mockSummary({ targetId: "module:src/routes" }),
    ];

    const groups = splitBySubsystem(findings, summaries);
    expect(groups.length).toBe(1);
    expect(groups[0].name).toBe("src/routes");
  });
});
