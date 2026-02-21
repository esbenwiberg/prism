/**
 * Tests for language detection and grammar registry.
 */

import { describe, it, expect } from "vitest";
import {
  detectLanguage,
  getSupportedExtensions,
  getSupportedLanguages,
  isSupportedLanguage,
  getGrammarPath,
} from "./languages.js";

describe("detectLanguage", () => {
  it("detects TypeScript files", () => {
    expect(detectLanguage("src/index.ts")).toBe("typescript");
  });

  it("detects TSX files", () => {
    expect(detectLanguage("App.tsx")).toBe("tsx");
  });

  it("detects JavaScript files", () => {
    expect(detectLanguage("lib/utils.js")).toBe("javascript");
    expect(detectLanguage("lib/utils.jsx")).toBe("javascript");
    expect(detectLanguage("lib/utils.mjs")).toBe("javascript");
    expect(detectLanguage("lib/utils.cjs")).toBe("javascript");
  });

  it("detects Python files", () => {
    expect(detectLanguage("main.py")).toBe("python");
  });

  it("detects C# files", () => {
    expect(detectLanguage("Program.cs")).toBe("c_sharp");
  });

  it("returns null for unsupported extensions", () => {
    expect(detectLanguage("README.md")).toBeNull();
    expect(detectLanguage("style.css")).toBeNull();
    expect(detectLanguage("data.json")).toBeNull();
    expect(detectLanguage("Makefile")).toBeNull();
  });

  it("handles case-insensitive extensions", () => {
    expect(detectLanguage("file.TS")).toBe("typescript");
    expect(detectLanguage("file.PY")).toBe("python");
  });
});

describe("getSupportedExtensions", () => {
  it("returns a set of known extensions", () => {
    const exts = getSupportedExtensions();
    expect(exts.has(".ts")).toBe(true);
    expect(exts.has(".tsx")).toBe(true);
    expect(exts.has(".js")).toBe(true);
    expect(exts.has(".py")).toBe(true);
    expect(exts.has(".cs")).toBe(true);
  });
});

describe("getSupportedLanguages", () => {
  it("returns all supported languages", () => {
    const langs = getSupportedLanguages();
    expect(langs).toContain("typescript");
    expect(langs).toContain("tsx");
    expect(langs).toContain("javascript");
    expect(langs).toContain("python");
    expect(langs).toContain("c_sharp");
  });
});

describe("isSupportedLanguage", () => {
  it("returns true for supported languages", () => {
    expect(isSupportedLanguage("typescript")).toBe(true);
    expect(isSupportedLanguage("python")).toBe(true);
  });

  it("returns false for unsupported languages", () => {
    expect(isSupportedLanguage("rust")).toBe(false);
    expect(isSupportedLanguage("")).toBe(false);
  });
});

describe("getGrammarPath", () => {
  it("resolves grammar paths that end with .wasm", () => {
    const path = getGrammarPath("typescript");
    expect(path).toMatch(/tree-sitter-typescript\.wasm$/);
  });

  it("resolves different grammars for each language", () => {
    const tsPath = getGrammarPath("typescript");
    const pyPath = getGrammarPath("python");
    expect(tsPath).not.toBe(pyPath);
    expect(pyPath).toMatch(/tree-sitter-python\.wasm$/);
  });
});
