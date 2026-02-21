/**
 * Tests for blueprint markdown renderer.
 */

import { describe, it, expect } from "vitest";
import {
  renderMasterPlanMarkdown,
  renderPhaseMarkdown,
  renderFullBlueprintMarkdown,
} from "./markdown.js";
import type { MasterPlanOutline, BlueprintPhase } from "./types.js";

const samplePlan: MasterPlanOutline = {
  title: "Blueprint: Modernize Auth System",
  summary: "Restructure the authentication module for enterprise deployment.",
  nonGoals: ["Mobile app support", "SSO via SAML"],
  acceptanceCriteria: ["All tests pass", "Auth latency under 200ms"],
  risks: [
    { risk: "Token migration downtime", severity: "high", mitigation: "Run dual auth for 2 weeks" },
    { risk: "Key rotation complexity", severity: "medium", mitigation: "Automate via cron" },
  ],
  phases: [
    { title: "Foundation", intent: "Set up JWT infrastructure", milestones: ["Add JWT lib", "Token schema"] },
    { title: "Core Migration", intent: "Replace sessions with JWT", milestones: ["JWT middleware", "Login flow", "Logout"] },
  ],
};

const samplePhase: BlueprintPhase = {
  title: "Foundation",
  intent: "Set up the JWT infrastructure needed for the migration.",
  milestones: [
    {
      title: "Add JWT library",
      intent: "Install and configure jose for JWT operations.",
      keyFiles: ["package.json", "src/auth/jwt.ts"],
      verification: "npm run build && npm test",
      details: "Install jose and create a JWT utility module with sign/verify functions.",
    },
    {
      title: "Create token schema",
      intent: "Define DB tables for refresh tokens.",
      keyFiles: ["src/db/schema.ts", "drizzle/0002_tokens.sql"],
      verification: "npm run build",
      details: "Add refresh_tokens table with user_id, token_hash, and expires_at columns.",
    },
  ],
};

// ---------------------------------------------------------------------------
// renderMasterPlanMarkdown
// ---------------------------------------------------------------------------

describe("renderMasterPlanMarkdown", () => {
  it("renders title and phase count", () => {
    const md = renderMasterPlanMarkdown(samplePlan);
    expect(md).toContain("# Blueprint: Modernize Auth System");
    expect(md).toContain("**Phases: 2**");
  });

  it("renders summary section", () => {
    const md = renderMasterPlanMarkdown(samplePlan);
    expect(md).toContain("## Summary");
    expect(md).toContain("Restructure the authentication module");
  });

  it("renders non-goals", () => {
    const md = renderMasterPlanMarkdown(samplePlan);
    expect(md).toContain("## Non-Goals");
    expect(md).toContain("- Mobile app support");
    expect(md).toContain("- SSO via SAML");
  });

  it("renders acceptance criteria", () => {
    const md = renderMasterPlanMarkdown(samplePlan);
    expect(md).toContain("## Acceptance Criteria");
    expect(md).toContain("- All tests pass");
  });

  it("renders risks with severity", () => {
    const md = renderMasterPlanMarkdown(samplePlan);
    expect(md).toContain("## Risks");
    expect(md).toContain("**[high]**");
    expect(md).toContain("Token migration downtime");
  });

  it("renders phase overview with milestone counts", () => {
    const md = renderMasterPlanMarkdown(samplePlan);
    expect(md).toContain("## Phase Overview");
    expect(md).toContain("1. **Foundation** — 2 milestones");
    expect(md).toContain("2. **Core Migration** — 3 milestones");
  });

  it("omits non-goals section when empty", () => {
    const plan = { ...samplePlan, nonGoals: [] };
    const md = renderMasterPlanMarkdown(plan);
    expect(md).not.toContain("## Non-Goals");
  });
});

// ---------------------------------------------------------------------------
// renderPhaseMarkdown
// ---------------------------------------------------------------------------

describe("renderPhaseMarkdown", () => {
  it("renders phase header with milestone count", () => {
    const md = renderPhaseMarkdown(samplePhase, 1);
    expect(md).toContain("# Phase 1: Foundation");
    expect(md).toContain("**Milestones: 2**");
  });

  it("renders milestone titles with numbers", () => {
    const md = renderPhaseMarkdown(samplePhase, 1);
    expect(md).toContain("## Milestone 1: Add JWT library");
    expect(md).toContain("## Milestone 2: Create token schema");
  });

  it("renders key files", () => {
    const md = renderPhaseMarkdown(samplePhase, 1);
    expect(md).toContain("**Key files**: package.json, src/auth/jwt.ts");
  });

  it("renders verification in a code block", () => {
    const md = renderPhaseMarkdown(samplePhase, 1);
    expect(md).toContain("**Verification**:");
    expect(md).toContain("```bash");
    expect(md).toContain("npm run build && npm test");
    expect(md).toContain("```");
  });

  it("renders milestone details", () => {
    const md = renderPhaseMarkdown(samplePhase, 1);
    expect(md).toContain("Install jose and create a JWT utility");
  });

  it("renders phase intent", () => {
    const md = renderPhaseMarkdown(samplePhase, 1);
    expect(md).toContain("Set up the JWT infrastructure needed for the migration.");
  });
});

// ---------------------------------------------------------------------------
// renderFullBlueprintMarkdown
// ---------------------------------------------------------------------------

describe("renderFullBlueprintMarkdown", () => {
  it("renders master plan and all phases", () => {
    const md = renderFullBlueprintMarkdown(samplePlan, [samplePhase]);
    expect(md).toContain("# Blueprint: Modernize Auth System");
    expect(md).toContain("# Phase 1: Foundation");
    expect(md).toContain("---");
  });
});
