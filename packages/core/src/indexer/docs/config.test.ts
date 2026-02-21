/**
 * Tests for config file detection and parsing.
 */

import { describe, it, expect } from "vitest";
import {
  isConfigurationFile,
  classifyConfigFile,
  parseConfigFiles,
  buildTechStack,
  buildConfigDocContent,
} from "./config.js";
import type { FileEntry } from "../types.js";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeFile(
  path: string,
  content: string,
  language: FileEntry["language"] = null,
): FileEntry {
  return {
    path,
    absolutePath: `/project/${path}`,
    content,
    language,
    sizeBytes: Buffer.byteLength(content),
    lineCount: content.split("\n").length,
    contentHash: "test-hash",
  };
}

// ---------------------------------------------------------------------------
// isConfigurationFile
// ---------------------------------------------------------------------------

describe("isConfigurationFile", () => {
  it("identifies package.json", () => {
    expect(isConfigurationFile("package.json")).toBe(true);
  });

  it("identifies tsconfig.json", () => {
    expect(isConfigurationFile("tsconfig.json")).toBe(true);
  });

  it("identifies tsconfig.base.json", () => {
    expect(isConfigurationFile("tsconfig.base.json")).toBe(true);
  });

  it("identifies Dockerfile", () => {
    expect(isConfigurationFile("Dockerfile")).toBe(true);
  });

  it("identifies .env files", () => {
    expect(isConfigurationFile(".env")).toBe(true);
    expect(isConfigurationFile(".env.local")).toBe(true);
  });

  it("identifies CI configs", () => {
    expect(isConfigurationFile(".github/workflows/ci.yml")).toBe(true);
  });

  it("identifies docker-compose", () => {
    expect(isConfigurationFile("docker-compose.yml")).toBe(true);
  });

  it("identifies vitest config", () => {
    expect(isConfigurationFile("vitest.config.ts")).toBe(true);
  });

  it("does not identify source files", () => {
    expect(isConfigurationFile("src/index.ts")).toBe(false);
  });

  it("does not identify README.md", () => {
    expect(isConfigurationFile("README.md")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyConfigFile
// ---------------------------------------------------------------------------

describe("classifyConfigFile", () => {
  it("classifies package.json", () => {
    const file = makeFile(
      "package.json",
      JSON.stringify({
        name: "my-app",
        description: "A test app",
        version: "1.0.0",
        dependencies: { express: "^4.0.0" },
        scripts: { build: "tsc", test: "vitest" },
      }),
    );
    const info = classifyConfigFile(file);
    expect(info).not.toBeNull();
    expect(info!.category).toBe("package-manager");
    expect(info!.purpose).toBe("Node.js package manifest");
    expect(info!.details.name).toBe("my-app");
    expect(info!.details.description).toBe("A test app");
    expect(info!.details.dependencies).toContain("express");
  });

  it("classifies tsconfig.json", () => {
    const file = makeFile(
      "tsconfig.json",
      JSON.stringify({
        compilerOptions: { target: "ES2022", module: "Node16", strict: true },
      }),
    );
    const info = classifyConfigFile(file);
    expect(info).not.toBeNull();
    expect(info!.category).toBe("typescript");
    expect(info!.details.target).toBe("ES2022");
    expect(info!.details.module).toBe("Node16");
    expect(info!.details.strict).toBe("true");
  });

  it("classifies Dockerfile", () => {
    const file = makeFile("Dockerfile", "FROM node:22-alpine\nWORKDIR /app");
    const info = classifyConfigFile(file);
    expect(info).not.toBeNull();
    expect(info!.category).toBe("docker");
    expect(info!.details.baseImage).toBe("node:22-alpine");
  });

  it("classifies .env file", () => {
    const file = makeFile(".env.example", "DATABASE_URL=postgres://\nPORT=3000");
    const info = classifyConfigFile(file);
    expect(info).not.toBeNull();
    expect(info!.category).toBe("environment");
    expect(info!.details.variables).toContain("DATABASE_URL");
    expect(info!.details.variables).toContain("PORT");
  });

  it("returns null for non-config files", () => {
    const file = makeFile("src/index.ts", "export const x = 1;");
    const info = classifyConfigFile(file);
    expect(info).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseConfigFiles
// ---------------------------------------------------------------------------

describe("parseConfigFiles", () => {
  it("parses multiple config files", () => {
    const files = [
      makeFile("package.json", '{"name": "test"}'),
      makeFile("tsconfig.json", '{"compilerOptions": {"strict": true}}'),
      makeFile("src/index.ts", "export const x = 1;"),
    ];
    const results = parseConfigFiles(files);
    expect(results).toHaveLength(2);
    expect(results[0].filePath).toBe("package.json");
    expect(results[1].filePath).toBe("tsconfig.json");
  });
});

// ---------------------------------------------------------------------------
// buildTechStack
// ---------------------------------------------------------------------------

describe("buildTechStack", () => {
  it("detects languages from file entries", () => {
    const configs = parseConfigFiles([]);
    const files: FileEntry[] = [
      makeFile("src/index.ts", "export const x = 1;", "typescript"),
      makeFile("main.py", "x = 1", "python"),
    ];
    const stack = buildTechStack(configs, files);
    expect(stack.languages).toContain("TypeScript");
    expect(stack.languages).toContain("Python");
  });

  it("detects frameworks from package.json dependencies", () => {
    const files: FileEntry[] = [
      makeFile(
        "package.json",
        JSON.stringify({
          dependencies: { express: "^4.0.0", react: "^18.0.0" },
        }),
      ),
    ];
    const configs = parseConfigFiles(files);
    const stack = buildTechStack(configs, files);
    expect(stack.frameworks).toContain("express");
    expect(stack.frameworks).toContain("react");
  });

  it("detects Docker from Docker config files", () => {
    const files: FileEntry[] = [
      makeFile("Dockerfile", "FROM node:22"),
    ];
    const configs = parseConfigFiles(files);
    const stack = buildTechStack(configs, files);
    expect(stack.containerization).toContain("Docker");
  });

  it("detects test frameworks", () => {
    const files: FileEntry[] = [
      makeFile("vitest.config.ts", "export default {}"),
    ];
    const configs = parseConfigFiles(files);
    const stack = buildTechStack(configs, files);
    expect(stack.testFrameworks).toContain("Vitest configuration");
  });
});

// ---------------------------------------------------------------------------
// buildConfigDocContent
// ---------------------------------------------------------------------------

describe("buildConfigDocContent", () => {
  it("builds readable doc content", () => {
    const file = makeFile(
      "package.json",
      JSON.stringify({ name: "test-app", description: "A test" }),
    );
    const info = classifyConfigFile(file)!;
    const docContent = buildConfigDocContent(info);
    expect(docContent).toContain("Config: Node.js package manifest");
    expect(docContent).toContain("Category: package-manager");
    expect(docContent).toContain("test-app");
  });
});
