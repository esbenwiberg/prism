/**
 * Tests for blueprint generator parsing (hierarchical).
 */

import { describe, it, expect } from "vitest";
import {
  parseMasterPlanOutline,
  parsePhaseDetail,
  parseBlueprintProposals,
} from "./generator.js";

// ---------------------------------------------------------------------------
// parseMasterPlanOutline
// ---------------------------------------------------------------------------

describe("parseMasterPlanOutline", () => {
  it("parses a valid master plan", () => {
    const raw = JSON.stringify({
      title: "Blueprint: Modernize Auth",
      summary: "Restructure the auth module for enterprise use.",
      nonGoals: ["Mobile support", "OAuth2 device flow"],
      acceptanceCriteria: ["All tests pass", "Auth latency < 200ms"],
      risks: [
        { risk: "Token migration", severity: "high", mitigation: "Run dual auth for 2 weeks" },
      ],
      phases: [
        {
          title: "Foundation",
          intent: "Set up infrastructure for new auth",
          milestones: ["Add JWT library", "Create token schema"],
        },
        {
          title: "Core Migration",
          intent: "Replace session-based auth with JWT",
          milestones: ["Implement JWT middleware", "Update login flow", "Update logout"],
        },
      ],
    });

    const plan = parseMasterPlanOutline(raw);
    expect(plan).not.toBeNull();
    expect(plan!.title).toBe("Blueprint: Modernize Auth");
    expect(plan!.phases).toHaveLength(2);
    expect(plan!.phases[0].milestones).toHaveLength(2);
    expect(plan!.phases[1].milestones).toHaveLength(3);
    expect(plan!.nonGoals).toHaveLength(2);
    expect(plan!.risks).toHaveLength(1);
    expect(plan!.risks[0].severity).toBe("high");
  });

  it("strips markdown code fences", () => {
    const raw = '```json\n{"title":"T","summary":"S","nonGoals":[],"acceptanceCriteria":[],"risks":[],"phases":[{"title":"P","intent":"I","milestones":["M1"]}]}\n```';
    const plan = parseMasterPlanOutline(raw);
    expect(plan).not.toBeNull();
    expect(plan!.title).toBe("T");
    expect(plan!.phases).toHaveLength(1);
  });

  it("returns null for invalid JSON", () => {
    expect(parseMasterPlanOutline("not json")).toBeNull();
  });

  it("returns null for plan with no phases", () => {
    const raw = JSON.stringify({ title: "T", summary: "S", phases: [] });
    expect(parseMasterPlanOutline(raw)).toBeNull();
  });

  it("provides defaults for missing optional fields", () => {
    const raw = JSON.stringify({
      phases: [{ title: "P", intent: "I", milestones: ["M"] }],
    });
    const plan = parseMasterPlanOutline(raw);
    expect(plan).not.toBeNull();
    expect(plan!.title).toBe("Untitled Blueprint");
    expect(plan!.summary).toBe("");
    expect(plan!.nonGoals).toEqual([]);
    expect(plan!.acceptanceCriteria).toEqual([]);
    expect(plan!.risks).toEqual([]);
  });

  it("returns null for non-object JSON", () => {
    expect(parseMasterPlanOutline("[1,2,3]")).toBeNull();
  });

  it("handles empty string", () => {
    expect(parseMasterPlanOutline("")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parsePhaseDetail
// ---------------------------------------------------------------------------

describe("parsePhaseDetail", () => {
  it("parses valid phase detail", () => {
    const raw = JSON.stringify({
      title: "Foundation",
      intent: "Set up infrastructure",
      milestones: [
        {
          title: "Add JWT library",
          intent: "Install and configure JWT",
          keyFiles: ["package.json", "src/auth/jwt.ts"],
          verification: "npm run build && npm test",
          details: "Install jose library and create JWT utility.",
        },
        {
          title: "Create token schema",
          intent: "Define DB tables for refresh tokens",
          keyFiles: ["src/db/schema.ts"],
          verification: "npm run build",
          details: "Add refresh_tokens table.",
        },
      ],
    });

    const phase = parsePhaseDetail(raw);
    expect(phase).not.toBeNull();
    expect(phase!.title).toBe("Foundation");
    expect(phase!.milestones).toHaveLength(2);
    expect(phase!.milestones[0].keyFiles).toEqual(["package.json", "src/auth/jwt.ts"]);
    expect(phase!.milestones[1].verification).toBe("npm run build");
  });

  it("returns null for invalid JSON", () => {
    expect(parsePhaseDetail("not json")).toBeNull();
  });

  it("provides defaults for missing milestone fields", () => {
    const raw = JSON.stringify({
      title: "P",
      milestones: [{}],
    });
    const phase = parsePhaseDetail(raw);
    expect(phase).not.toBeNull();
    expect(phase!.milestones[0].title).toBe("Untitled milestone");
    expect(phase!.milestones[0].keyFiles).toEqual([]);
    expect(phase!.milestones[0].verification).toBe("");
  });

  it("handles empty milestones array", () => {
    const raw = JSON.stringify({ title: "P", intent: "I", milestones: [] });
    const phase = parsePhaseDetail(raw);
    expect(phase).not.toBeNull();
    expect(phase!.milestones).toEqual([]);
  });

  it("strips code fences", () => {
    const raw = '```json\n{"title":"P","intent":"I","milestones":[{"title":"M","intent":"MI","keyFiles":[],"verification":"v","details":"d"}]}\n```';
    const phase = parsePhaseDetail(raw);
    expect(phase).not.toBeNull();
    expect(phase!.milestones[0].title).toBe("M");
  });
});

// ---------------------------------------------------------------------------
// parseBlueprintProposals (legacy — backward compat)
// ---------------------------------------------------------------------------

describe("parseBlueprintProposals (legacy)", () => {
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
