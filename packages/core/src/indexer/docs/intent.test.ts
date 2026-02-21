/**
 * Tests for intent layer assembly.
 */

import { describe, it, expect } from "vitest";
import { assembleIntent, buildIntentDocContent } from "./intent.js";
import type { ReadmeParseResult } from "./readme.js";
import type { FileCommentsResult } from "./comments.js";
import type { ConfigInfo, TechStackInfo } from "./config.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReadmeResult(
  overrides: Partial<ReadmeParseResult> = {},
): ReadmeParseResult {
  return {
    filePath: "README.md",
    title: "Test Project",
    sections: [],
    purpose: null,
    architecture: null,
    setupInstructions: null,
    summary: "# Test Project",
    ...overrides,
  };
}

function makeConfigInfo(
  overrides: Partial<ConfigInfo> = {},
): ConfigInfo {
  return {
    filePath: "package.json",
    category: "package-manager",
    purpose: "Node.js package manifest",
    details: {},
    ...overrides,
  };
}

function makeCommentResult(
  overrides: Partial<FileCommentsResult> = {},
): FileCommentsResult {
  return {
    filePath: "src/index.ts",
    fileHeader: null,
    comments: [],
    docContent: "",
    ...overrides,
  };
}

function makeTechStack(
  overrides: Partial<TechStackInfo> = {},
): TechStackInfo {
  return {
    languages: [],
    frameworks: [],
    buildTools: [],
    testFrameworks: [],
    ciSystems: [],
    containerization: [],
    dependencies: [],
    scripts: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// assembleIntent
// ---------------------------------------------------------------------------

describe("assembleIntent", () => {
  it("extracts description from package.json", () => {
    const configs = [
      makeConfigInfo({
        details: { description: "A great tool for analysis" },
      }),
    ];
    const intent = assembleIntent([], configs, [], makeTechStack());
    expect(intent.description).toBe("A great tool for analysis");
  });

  it("falls back to README purpose for description", () => {
    const readmes = [
      makeReadmeResult({
        purpose: "A tool for indexing codebases. It does great things.",
      }),
    ];
    const intent = assembleIntent(readmes, [], [], makeTechStack());
    expect(intent.description).toContain("A tool for indexing codebases");
  });

  it("falls back to README title when no purpose", () => {
    const readmes = [makeReadmeResult({ title: "My Cool Project" })];
    const intent = assembleIntent(readmes, [], [], makeTechStack());
    expect(intent.description).toBe("My Cool Project");
  });

  it("returns default description when nothing is available", () => {
    const intent = assembleIntent([], [], [], makeTechStack());
    expect(intent.description).toBe("No project description found.");
  });

  it("extracts purpose from primary README", () => {
    const readmes = [
      makeReadmeResult({ purpose: "Analyzes code structure." }),
    ];
    const intent = assembleIntent(readmes, [], [], makeTechStack());
    expect(intent.purpose).toBe("Analyzes code structure.");
  });

  it("extracts architecture from primary README", () => {
    const readmes = [
      makeReadmeResult({ architecture: "Monorepo with two packages." }),
    ];
    const intent = assembleIntent(readmes, [], [], makeTechStack());
    expect(intent.architecture).toBe("Monorepo with two packages.");
  });

  it("includes tech stack summary", () => {
    const techStack = makeTechStack({
      languages: ["TypeScript", "Python"],
      frameworks: ["express"],
    });
    const intent = assembleIntent([], [], [], techStack);
    expect(intent.techStack.languages).toEqual(["TypeScript", "Python"]);
    expect(intent.techStack.frameworks).toEqual(["express"]);
  });

  it("identifies modules from sub-package package.json files", () => {
    const configs = [
      makeConfigInfo({
        filePath: "packages/core/package.json",
        details: { name: "@prism/core", description: "Core engine" },
      }),
      makeConfigInfo({
        filePath: "packages/app/package.json",
        details: { name: "@prism/app", description: "CLI app" },
      }),
    ];
    const intent = assembleIntent([], configs, [], makeTechStack());
    expect(intent.modules).toHaveLength(2);
    expect(intent.modules[0].name).toBe("@prism/core");
    expect(intent.modules[0].description).toBe("Core engine");
    expect(intent.modules[1].name).toBe("@prism/app");
  });

  it("enriches modules with file header descriptions from comments", () => {
    const configs = [
      makeConfigInfo({
        filePath: "packages/core/package.json",
        details: { name: "@prism/core" },
      }),
    ];
    const comments = [
      makeCommentResult({
        filePath: "packages/core/src/logger.ts",
        fileHeader: "Pino logger singleton for the core package.",
      }),
    ];
    const intent = assembleIntent([], configs, comments, makeTechStack());
    expect(intent.modules[0].fileDescriptions).toHaveLength(1);
    expect(intent.modules[0].fileDescriptions[0].path).toBe(
      "packages/core/src/logger.ts",
    );
  });
});

// ---------------------------------------------------------------------------
// buildIntentDocContent
// ---------------------------------------------------------------------------

describe("buildIntentDocContent", () => {
  it("produces non-empty full text", () => {
    const readmes = [
      makeReadmeResult({
        purpose: "Indexes codebases.",
        architecture: "Two packages.",
      }),
    ];
    const techStack = makeTechStack({ languages: ["TypeScript"] });
    const intent = assembleIntent(readmes, [], [], techStack);
    const text = buildIntentDocContent(intent);

    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain("Project Intent");
    expect(text).toContain("Purpose");
    expect(text).toContain("Indexes codebases");
    expect(text).toContain("Architecture");
    expect(text).toContain("Two packages");
    expect(text).toContain("TypeScript");
  });

  it("includes module information", () => {
    const configs = [
      makeConfigInfo({
        filePath: "packages/core/package.json",
        details: { name: "@prism/core", description: "Core engine" },
      }),
    ];
    const intent = assembleIntent([], configs, [], makeTechStack());
    const text = buildIntentDocContent(intent);

    expect(text).toContain("Modules");
    expect(text).toContain("@prism/core");
    expect(text).toContain("Core engine");
  });
});
