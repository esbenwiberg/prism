/**
 * Tests for gap analysis parsing.
 */

import { describe, it, expect } from "vitest";
import { parseGapFindings } from "./gap-analysis.js";

describe("parseGapFindings", () => {
  it("parses a valid JSON array of gap findings", () => {
    const raw = JSON.stringify([
      {
        title: "Missing auth docs",
        description: "Auth module not documented",
        severity: "medium",
        category: "gap",
      },
      {
        title: "Stale API docs",
        description: "API v1 docs reference removed endpoints",
        severity: "high",
        category: "gap",
      },
    ]);

    const findings = parseGapFindings(raw);
    expect(findings.length).toBe(2);
    expect(findings[0].title).toBe("Missing auth docs");
    expect(findings[0].severity).toBe("medium");
    expect(findings[0].category).toBe("gap");
    expect(findings[1].severity).toBe("high");
  });

  it("strips markdown code fences", () => {
    const raw = '```json\n[{"title":"Test","description":"Desc","severity":"low","category":"gap"}]\n```';

    const findings = parseGapFindings(raw);
    expect(findings.length).toBe(1);
    expect(findings[0].title).toBe("Test");
  });

  it("handles code fences without json label", () => {
    const raw = '```\n[{"title":"Test","description":"Desc","severity":"low","category":"gap"}]\n```';

    const findings = parseGapFindings(raw);
    expect(findings.length).toBe(1);
  });

  it("returns empty array for invalid JSON", () => {
    const findings = parseGapFindings("not valid json");
    expect(findings).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    const findings = parseGapFindings('{"title": "test"}');
    expect(findings).toEqual([]);
  });

  it("defaults severity to low for unknown values", () => {
    const raw = JSON.stringify([
      { title: "Test", description: "Desc", severity: "extreme", category: "gap" },
    ]);

    const findings = parseGapFindings(raw);
    expect(findings[0].severity).toBe("low");
  });

  it("provides defaults for missing fields", () => {
    const raw = JSON.stringify([{}]);

    const findings = parseGapFindings(raw);
    expect(findings.length).toBe(1);
    expect(findings[0].title).toBe("Unknown gap");
    expect(findings[0].description).toBe("");
    expect(findings[0].severity).toBe("low");
    expect(findings[0].category).toBe("gap");
  });

  it("handles empty array", () => {
    const findings = parseGapFindings("[]");
    expect(findings).toEqual([]);
  });

  it("handles empty string", () => {
    const findings = parseGapFindings("");
    expect(findings).toEqual([]);
  });

  it("filters out null entries", () => {
    const raw = JSON.stringify([
      null,
      { title: "Valid", description: "Valid desc", severity: "low", category: "gap" },
      null,
    ]);

    const findings = parseGapFindings(raw);
    expect(findings.length).toBe(1);
    expect(findings[0].title).toBe("Valid");
  });
});
