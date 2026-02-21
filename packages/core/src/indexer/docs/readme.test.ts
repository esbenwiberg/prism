/**
 * Tests for README/documentation file parsing.
 */

import { describe, it, expect } from "vitest";
import {
  isDocumentationFile,
  parseReadme,
  parseDocFiles,
  parseMarkdownSections,
} from "./readme.js";
import type { FileEntry } from "../types.js";

// ---------------------------------------------------------------------------
// Helper to create a FileEntry from content
// ---------------------------------------------------------------------------

function makeFile(path: string, content: string): FileEntry {
  return {
    path,
    absolutePath: `/project/${path}`,
    content,
    language: null,
    sizeBytes: Buffer.byteLength(content),
    lineCount: content.split("\n").length,
    contentHash: "test-hash",
  };
}

// ---------------------------------------------------------------------------
// isDocumentationFile
// ---------------------------------------------------------------------------

describe("isDocumentationFile", () => {
  it("identifies README.md", () => {
    expect(isDocumentationFile("README.md")).toBe(true);
  });

  it("identifies readme.md (case insensitive)", () => {
    expect(isDocumentationFile("readme.md")).toBe(true);
  });

  it("identifies README without extension", () => {
    expect(isDocumentationFile("README")).toBe(true);
  });

  it("identifies CHANGELOG.md", () => {
    expect(isDocumentationFile("CHANGELOG.md")).toBe(true);
  });

  it("identifies CONTRIBUTING.md", () => {
    expect(isDocumentationFile("CONTRIBUTING.md")).toBe(true);
  });

  it("identifies LICENSE", () => {
    expect(isDocumentationFile("LICENSE")).toBe(true);
  });

  it("identifies markdown files in docs/ directory", () => {
    expect(isDocumentationFile("docs/architecture.md")).toBe(true);
  });

  it("identifies .rst files", () => {
    expect(isDocumentationFile("guide.rst")).toBe(true);
  });

  it("does not identify source code files", () => {
    expect(isDocumentationFile("src/index.ts")).toBe(false);
  });

  it("does not identify package.json", () => {
    expect(isDocumentationFile("package.json")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseMarkdownSections
// ---------------------------------------------------------------------------

describe("parseMarkdownSections", () => {
  it("extracts sections from a markdown document", () => {
    const content = `# Title

Introduction text.

## Getting Started

Setup instructions here.

## Architecture

Architecture description.
`;
    const sections = parseMarkdownSections(content);
    expect(sections).toHaveLength(3);
    expect(sections[0].heading).toBe("Title");
    expect(sections[0].level).toBe(1);
    expect(sections[1].heading).toBe("Getting Started");
    expect(sections[1].level).toBe(2);
    expect(sections[2].heading).toBe("Architecture");
    expect(sections[2].level).toBe(2);
  });

  it("includes content under each heading", () => {
    const content = `# Project

This is the description.

## Setup

Run npm install.
`;
    const sections = parseMarkdownSections(content);
    expect(sections[0].content).toContain("This is the description.");
    expect(sections[1].content).toContain("Run npm install.");
  });

  it("handles document with no headings", () => {
    const content = "Just some plain text without any headings.";
    const sections = parseMarkdownSections(content);
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBe("");
    expect(sections[0].level).toBe(0);
    expect(sections[0].content).toContain("Just some plain text");
  });

  it("handles empty content", () => {
    const sections = parseMarkdownSections("");
    expect(sections).toHaveLength(0);
  });

  it("records correct start lines", () => {
    const content = `# First

Content.

# Second

More content.
`;
    const sections = parseMarkdownSections(content);
    expect(sections[0].startLine).toBe(1);
    expect(sections[1].startLine).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// parseReadme
// ---------------------------------------------------------------------------

describe("parseReadme", () => {
  it("extracts title from the first H1", () => {
    const file = makeFile("README.md", "# My Project\n\nSome description.");
    const result = parseReadme(file);
    expect(result.title).toBe("My Project");
  });

  it("falls back to filename when no H1", () => {
    const file = makeFile("README.md", "## Setup\n\nRun npm install.");
    const result = parseReadme(file);
    expect(result.title).toBe("README");
  });

  it("extracts purpose from 'What is' section", () => {
    const file = makeFile(
      "README.md",
      `# Project

## What is this?

A tool for doing things.

## Setup

npm install
`,
    );
    const result = parseReadme(file);
    expect(result.purpose).toContain("A tool for doing things");
  });

  it("extracts architecture section", () => {
    const file = makeFile(
      "README.md",
      `# Project

## Architecture

Two packages: core and app.
`,
    );
    const result = parseReadme(file);
    expect(result.architecture).toContain("Two packages");
  });

  it("extracts setup instructions", () => {
    const file = makeFile(
      "README.md",
      `# Project

## Installation

Run \`npm install\` to get started.
`,
    );
    const result = parseReadme(file);
    expect(result.setupInstructions).toContain("npm install");
  });

  it("builds a summary", () => {
    const file = makeFile(
      "README.md",
      `# My Tool

## About

A great tool.

## Architecture

Microservices.
`,
    );
    const result = parseReadme(file);
    expect(result.summary).toContain("My Tool");
    expect(result.summary).toContain("A great tool");
  });
});

// ---------------------------------------------------------------------------
// parseDocFiles
// ---------------------------------------------------------------------------

describe("parseDocFiles", () => {
  it("only processes documentation files", () => {
    const files: FileEntry[] = [
      makeFile("README.md", "# Hello"),
      makeFile("src/index.ts", 'export const x = 1;'),
      makeFile("docs/guide.md", "# Guide\n\nHello world."),
    ];
    const results = parseDocFiles(files);
    expect(results).toHaveLength(2);
    expect(results[0].filePath).toBe("README.md");
    expect(results[1].filePath).toBe("docs/guide.md");
  });

  it("returns empty array for no doc files", () => {
    const files: FileEntry[] = [
      makeFile("src/index.ts", 'export const x = 1;'),
    ];
    const results = parseDocFiles(files);
    expect(results).toHaveLength(0);
  });
});
