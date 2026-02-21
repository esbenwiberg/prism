/**
 * Tests for inline comment and docstring extraction.
 */

import { describe, it, expect } from "vitest";
import {
  extractComments,
  extractJSComments,
  extractPythonComments,
  extractCSharpComments,
} from "./comments.js";
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
// extractJSComments
// ---------------------------------------------------------------------------

describe("extractJSComments", () => {
  it("extracts single-line comments", () => {
    const comments = extractJSComments("// Hello world\nconst x = 1;");
    expect(comments).toHaveLength(1);
    expect(comments[0].kind).toBe("line");
    expect(comments[0].text).toBe("Hello world");
    expect(comments[0].startLine).toBe(1);
  });

  it("extracts JSDoc comments", () => {
    const source = `/**
 * This is a JSDoc comment.
 * @param x The value.
 */
function foo(x) {}`;
    const comments = extractJSComments(source);
    const jsdoc = comments.find((c) => c.kind === "jsdoc");
    expect(jsdoc).toBeDefined();
    expect(jsdoc!.text).toContain("This is a JSDoc comment");
    expect(jsdoc!.text).toContain("@param x The value");
  });

  it("extracts block comments", () => {
    const source = `/* A block comment */
const x = 1;`;
    const comments = extractJSComments(source);
    expect(comments).toHaveLength(1);
    expect(comments[0].kind).toBe("block");
    expect(comments[0].text).toContain("A block comment");
  });

  it("extracts multi-line block comments", () => {
    const source = `/*
 * Multi-line
 * block comment
 */
const x = 1;`;
    const comments = extractJSComments(source);
    expect(comments).toHaveLength(1);
    expect(comments[0].kind).toBe("block");
    expect(comments[0].startLine).toBe(1);
    expect(comments[0].endLine).toBe(4);
  });

  it("handles mixed comment types", () => {
    const source = `// Single line
/**
 * JSDoc
 */
/* Block */
const x = 1;`;
    const comments = extractJSComments(source);
    expect(comments).toHaveLength(3);
    expect(comments[0].kind).toBe("line");
    expect(comments[1].kind).toBe("jsdoc");
    expect(comments[2].kind).toBe("block");
  });
});

// ---------------------------------------------------------------------------
// extractPythonComments
// ---------------------------------------------------------------------------

describe("extractPythonComments", () => {
  it("extracts hash comments", () => {
    const comments = extractPythonComments("# This is a comment\nx = 1");
    expect(comments).toHaveLength(1);
    expect(comments[0].kind).toBe("line");
    expect(comments[0].text).toBe("This is a comment");
  });

  it("extracts single-line docstrings", () => {
    const source = '"""This is a docstring."""';
    const comments = extractPythonComments(source);
    expect(comments).toHaveLength(1);
    expect(comments[0].kind).toBe("docstring");
    expect(comments[0].text).toBe("This is a docstring.");
  });

  it("extracts multi-line docstrings", () => {
    const source = `"""
This is a multi-line
docstring.
"""
x = 1`;
    const comments = extractPythonComments(source);
    const docstring = comments.find((c) => c.kind === "docstring");
    expect(docstring).toBeDefined();
    expect(docstring!.text).toContain("This is a multi-line");
    expect(docstring!.text).toContain("docstring.");
  });

  it("extracts single-quote docstrings", () => {
    const source = "'''Single quote docstring.'''";
    const comments = extractPythonComments(source);
    expect(comments).toHaveLength(1);
    expect(comments[0].kind).toBe("docstring");
    expect(comments[0].text).toBe("Single quote docstring.");
  });
});

// ---------------------------------------------------------------------------
// extractCSharpComments
// ---------------------------------------------------------------------------

describe("extractCSharpComments", () => {
  it("extracts XML doc comments", () => {
    const source = `/// <summary>
/// Does something.
/// </summary>
public void Foo() {}`;
    const comments = extractCSharpComments(source);
    const xmlDoc = comments.find((c) => c.kind === "xml-doc");
    expect(xmlDoc).toBeDefined();
    expect(xmlDoc!.text).toContain("<summary>");
    expect(xmlDoc!.text).toContain("Does something.");
  });

  it("extracts single-line comments", () => {
    const comments = extractCSharpComments("// A comment\nint x = 1;");
    expect(comments).toHaveLength(1);
    expect(comments[0].kind).toBe("line");
    expect(comments[0].text).toBe("A comment");
  });

  it("extracts block comments", () => {
    const source = `/* Block comment */
int x = 1;`;
    const comments = extractCSharpComments(source);
    expect(comments).toHaveLength(1);
    expect(comments[0].kind).toBe("block");
  });
});

// ---------------------------------------------------------------------------
// extractComments (integration)
// ---------------------------------------------------------------------------

describe("extractComments", () => {
  it("routes TypeScript files to JS extractor", () => {
    const file = makeFile(
      "src/index.ts",
      "/** Module description. */\nexport const x = 1;",
      "typescript",
    );
    const result = extractComments(file);
    expect(result.filePath).toBe("src/index.ts");
    expect(result.fileHeader).toContain("Module description");
    expect(result.comments).toHaveLength(1);
  });

  it("routes Python files to Python extractor", () => {
    const file = makeFile(
      "main.py",
      '"""Module docstring."""\nx = 1',
      "python",
    );
    const result = extractComments(file);
    expect(result.filePath).toBe("main.py");
    expect(result.fileHeader).toBe("Module docstring.");
  });

  it("routes C# files to C# extractor", () => {
    const file = makeFile(
      "Program.cs",
      "// Entry point\nclass Program {}",
      "c_sharp",
    );
    const result = extractComments(file);
    expect(result.filePath).toBe("Program.cs");
    expect(result.comments).toHaveLength(1);
  });

  it("identifies file-level header comments", () => {
    const file = makeFile(
      "src/utils.ts",
      `/**
 * Utility functions for the application.
 */

export function add(a: number, b: number) { return a + b; }`,
      "typescript",
    );
    const result = extractComments(file);
    expect(result.fileHeader).toContain("Utility functions");
  });

  it("returns empty docContent for files without comments", () => {
    const file = makeFile(
      "src/empty.ts",
      "export const x = 1;\nexport const y = 2;\n",
      "typescript",
    );
    const result = extractComments(file);
    expect(result.comments).toHaveLength(0);
    expect(result.docContent).toBe("");
  });
});
