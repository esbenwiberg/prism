/**
 * Tests for the search command result formatting.
 */

import { describe, it, expect } from "vitest";
import { formatSearchResults } from "./search.js";

describe("formatSearchResults", () => {
  it("formats results as a text table", () => {
    const results = [
      {
        score: 0.95,
        filePath: "src/auth/login.ts",
        symbolName: "authenticate",
        symbolKind: "function",
        summaryContent: "Authenticates a user against the identity provider.",
      },
      {
        score: 0.72,
        filePath: "src/auth/session.ts",
        symbolName: "createSession",
        symbolKind: "function",
        summaryContent: "Creates a new session for the authenticated user.",
      },
    ];

    const output = formatSearchResults(results);

    // Header should be present
    expect(output).toContain("#");
    expect(output).toContain("Score");
    expect(output).toContain("Kind");
    expect(output).toContain("Symbol");
    expect(output).toContain("File");
    expect(output).toContain("Summary");

    // Results should be present
    expect(output).toContain("95.0%");
    expect(output).toContain("authenticate");
    expect(output).toContain("src/auth/login.ts");
    expect(output).toContain("72.0%");
    expect(output).toContain("createSession");
  });

  it("truncates long summaries", () => {
    const results = [
      {
        score: 0.85,
        filePath: "src/long.ts",
        symbolName: "longFn",
        symbolKind: "function",
        summaryContent: "A".repeat(100),
      },
    ];

    const output = formatSearchResults(results);
    expect(output).toContain("...");
  });

  it("handles null fields gracefully", () => {
    const results = [
      {
        score: 0.5,
        filePath: null,
        symbolName: null,
        symbolKind: null,
        summaryContent: "Some summary",
      },
    ];

    const output = formatSearchResults(results);
    expect(output).toContain("?");
    expect(output).toContain("Some summary");
  });

  it("returns empty table for no results", () => {
    const output = formatSearchResults([]);
    // Should still have header but no data rows
    expect(output).toContain("Score");
    expect(output.split("\n").length).toBeLessThanOrEqual(3);
  });
});
