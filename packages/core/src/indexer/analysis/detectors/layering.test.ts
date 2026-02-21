/**
 * Tests for layering violation detector.
 */

import { describe, it, expect } from "vitest";
import {
  detectLayeringViolations,
  detectLayer,
  type LayeringEdge,
} from "./layering.js";

describe("detectLayer", () => {
  it("detects data layer", () => {
    expect(detectLayer("src/db/connection.ts")).toEqual({ level: 0, name: "data" });
    expect(detectLayer("packages/core/src/database/pool.ts")).toEqual({ level: 0, name: "data" });
  });

  it("detects domain layer", () => {
    expect(detectLayer("src/domain/types.ts")).toEqual({ level: 1, name: "domain" });
    expect(detectLayer("src/models/user.ts")).toEqual({ level: 1, name: "domain" });
  });

  it("detects service layer", () => {
    expect(detectLayer("src/service/auth.ts")).toEqual({ level: 2, name: "service" });
    expect(detectLayer("src/indexer/pipeline.ts")).toEqual({ level: 2, name: "service" });
  });

  it("detects API layer", () => {
    expect(detectLayer("src/routes/users.ts")).toEqual({ level: 3, name: "api" });
    expect(detectLayer("src/api/v1/handler.ts")).toEqual({ level: 3, name: "api" });
  });

  it("detects presentation layer", () => {
    expect(detectLayer("src/views/index.ts")).toEqual({ level: 4, name: "presentation" });
    expect(detectLayer("src/dashboard/main.ts")).toEqual({ level: 4, name: "presentation" });
    expect(detectLayer("src/cli/commands/init.ts")).toEqual({ level: 4, name: "presentation" });
  });

  it("returns null for files without detectable layers", () => {
    expect(detectLayer("src/utils/helpers.ts")).toBeNull();
    expect(detectLayer("index.ts")).toBeNull();
  });
});

describe("detectLayeringViolations", () => {
  it("returns empty findings for correct layering", () => {
    const edges: LayeringEdge[] = [
      // Presentation -> API (correct: higher -> lower)
      {
        sourceFileId: 1,
        sourceFilePath: "src/views/home.ts",
        targetFileId: 2,
        targetFilePath: "src/routes/api.ts",
      },
      // API -> Service (correct)
      {
        sourceFileId: 2,
        sourceFilePath: "src/routes/api.ts",
        targetFileId: 3,
        targetFilePath: "src/service/user.ts",
      },
    ];

    const findings = detectLayeringViolations(edges);
    expect(findings).toEqual([]);
  });

  it("detects upward dependency (lower layer imports higher layer)", () => {
    const edges: LayeringEdge[] = [
      {
        sourceFileId: 1,
        sourceFilePath: "src/db/repo.ts",
        targetFileId: 2,
        targetFilePath: "src/views/home.ts",
      },
    ];

    const findings = detectLayeringViolations(edges);
    expect(findings.length).toBe(1);
    expect(findings[0].category).toBe("layering");
    expect(findings[0].title).toContain("Upward dependency");
    expect(findings[0].title).toContain("data -> presentation");
  });

  it("detects layer skipping", () => {
    const edges: LayeringEdge[] = [
      // Presentation (4) -> Data (0) — skips 3 layers
      {
        sourceFileId: 1,
        sourceFilePath: "src/views/admin.ts",
        targetFileId: 2,
        targetFilePath: "src/db/connection.ts",
      },
    ];

    const findings = detectLayeringViolations(edges);
    expect(findings.length).toBe(1);
    expect(findings[0].title).toContain("Layer skip");
    expect(findings[0].severity).toBe("low");
  });

  it("ignores edges between same layer", () => {
    const edges: LayeringEdge[] = [
      {
        sourceFileId: 1,
        sourceFilePath: "src/views/a.ts",
        targetFileId: 2,
        targetFilePath: "src/views/b.ts",
      },
    ];

    const findings = detectLayeringViolations(edges);
    expect(findings).toEqual([]);
  });

  it("ignores edges where layer is unknown", () => {
    const edges: LayeringEdge[] = [
      {
        sourceFileId: 1,
        sourceFilePath: "src/utils/helpers.ts",
        targetFileId: 2,
        targetFilePath: "src/db/connection.ts",
      },
    ];

    const findings = detectLayeringViolations(edges);
    expect(findings).toEqual([]);
  });

  it("assigns higher severity for large upward violations", () => {
    const edges: LayeringEdge[] = [
      // Data (0) -> Presentation (4) — 4 levels up
      {
        sourceFileId: 1,
        sourceFilePath: "src/db/query.ts",
        targetFileId: 2,
        targetFilePath: "src/views/dashboard.ts",
      },
    ];

    const findings = detectLayeringViolations(edges);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("high");
  });

  it("handles empty input", () => {
    expect(detectLayeringViolations([])).toEqual([]);
  });
});
