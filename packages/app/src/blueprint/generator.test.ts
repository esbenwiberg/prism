/**
 * Tests for blueprint generator parsing.
 */

import { describe, it, expect } from "vitest";
import { parseBlueprintProposals } from "./generator.js";

describe("parseBlueprintProposals", () => {
  it("parses valid JSON array of proposals", () => {
    const raw = JSON.stringify([
      {
        title: "Refactor auth module",
        subsystem: "auth",
        summary: "Extract auth into standalone service",
        proposedArchitecture: "Microservice architecture",
        moduleChanges: [
          { module: "src/auth", action: "modify", description: "Split into service" },
        ],
        migrationPath: "1. Create service\n2. Migrate clients",
        risks: [
          { risk: "Downtime", severity: "medium", mitigation: "Blue-green deploy" },
        ],
        rationale: "Reduces coupling in the auth module",
      },
    ]);

    const proposals = parseBlueprintProposals(raw);
    expect(proposals.length).toBe(1);
    expect(proposals[0].title).toBe("Refactor auth module");
    expect(proposals[0].subsystem).toBe("auth");
    expect(proposals[0].moduleChanges).toHaveLength(1);
    expect(proposals[0].risks).toHaveLength(1);
  });

  it("strips markdown code fences", () => {
    const raw = '```json\n[{"title":"Test","subsystem":"general","summary":"S","proposedArchitecture":"A","moduleChanges":[],"migrationPath":"M","risks":[],"rationale":"R"}]\n```';

    const proposals = parseBlueprintProposals(raw);
    expect(proposals.length).toBe(1);
    expect(proposals[0].title).toBe("Test");
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseBlueprintProposals("not json")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseBlueprintProposals('{"title":"test"}')).toEqual([]);
  });

  it("provides defaults for missing fields", () => {
    const raw = JSON.stringify([{}]);

    const proposals = parseBlueprintProposals(raw);
    expect(proposals.length).toBe(1);
    expect(proposals[0].title).toBe("Untitled proposal");
    expect(proposals[0].subsystem).toBe("general");
    expect(proposals[0].summary).toBe("");
    expect(proposals[0].moduleChanges).toEqual([]);
    expect(proposals[0].risks).toEqual([]);
  });

  it("handles empty array", () => {
    expect(parseBlueprintProposals("[]")).toEqual([]);
  });

  it("handles empty string", () => {
    expect(parseBlueprintProposals("")).toEqual([]);
  });

  it("filters out null entries in the array", () => {
    const raw = JSON.stringify([
      null,
      { title: "Valid", subsystem: "s", summary: "x" },
      null,
    ]);

    const proposals = parseBlueprintProposals(raw);
    expect(proposals.length).toBe(1);
    expect(proposals[0].title).toBe("Valid");
  });

  it("handles multiple proposals", () => {
    const raw = JSON.stringify([
      { title: "Proposal 1", subsystem: "a" },
      { title: "Proposal 2", subsystem: "b" },
      { title: "Proposal 3", subsystem: "c" },
    ]);

    const proposals = parseBlueprintProposals(raw);
    expect(proposals.length).toBe(3);
    expect(proposals.map((p) => p.title)).toEqual([
      "Proposal 1",
      "Proposal 2",
      "Proposal 3",
    ]);
  });
});
