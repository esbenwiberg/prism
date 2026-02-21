/**
 * Tests for dependency graph extraction.
 */

import { describe, it, expect, beforeAll } from "vitest";
import Parser from "web-tree-sitter";
import { extractDependencies } from "./graph.js";
import { getGrammarPath } from "./languages.js";

let tsLang: Parser.Language;
let pyLang: Parser.Language;

beforeAll(async () => {
  await Parser.init();
  tsLang = await Parser.Language.load(getGrammarPath("typescript"));
  pyLang = await Parser.Language.load(getGrammarPath("python"));
});

function parse(source: string, lang: Parser.Language): Parser.Tree {
  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(source);
  parser.delete();
  return tree;
}

describe("extractDependencies — TypeScript", () => {
  const projectFiles = new Set([
    "src/index.ts",
    "src/utils.ts",
    "src/helpers/format.ts",
    "src/lib/index.ts",
  ]);

  it("extracts import with relative specifier", () => {
    const source = `import { foo } from "./utils.js";`;
    const tree = parse(source, tsLang);
    const deps = extractDependencies(
      tree.rootNode,
      "typescript",
      "src/index.ts",
      projectFiles,
    );
    tree.delete();

    expect(deps).toHaveLength(1);
    expect(deps[0].sourceFile).toBe("src/index.ts");
    expect(deps[0].importSpecifier).toBe("./utils.js");
    expect(deps[0].targetFile).toBe("src/utils.ts");
    expect(deps[0].kind).toBe("import");
  });

  it("resolves relative path with directory traversal", () => {
    const source = `import { format } from "../helpers/format.js";`;
    const tree = parse(source, tsLang);
    const deps = extractDependencies(
      tree.rootNode,
      "typescript",
      "src/lib/index.ts",
      projectFiles,
    );
    tree.delete();

    expect(deps).toHaveLength(1);
    expect(deps[0].targetFile).toBe("src/helpers/format.ts");
  });

  it("returns null for external package imports", () => {
    const source = `import express from "express";`;
    const tree = parse(source, tsLang);
    const deps = extractDependencies(
      tree.rootNode,
      "typescript",
      "src/index.ts",
      projectFiles,
    );
    tree.delete();

    expect(deps).toHaveLength(1);
    expect(deps[0].targetFile).toBeNull();
    expect(deps[0].importSpecifier).toBe("express");
  });

  it("extracts re-export statements", () => {
    const source = `export { foo } from "./utils.js";`;
    const tree = parse(source, tsLang);
    const deps = extractDependencies(
      tree.rootNode,
      "typescript",
      "src/index.ts",
      projectFiles,
    );
    tree.delete();

    expect(deps).toHaveLength(1);
    expect(deps[0].kind).toBe("import");
    expect(deps[0].targetFile).toBe("src/utils.ts");
  });

  it("resolves index file imports", () => {
    const source = `import { something } from "./lib";`;
    const tree = parse(source, tsLang);
    const deps = extractDependencies(
      tree.rootNode,
      "typescript",
      "src/index.ts",
      projectFiles,
    );
    tree.delete();

    expect(deps).toHaveLength(1);
    // Should resolve to src/lib/index.ts
    expect(deps[0].targetFile).toBe("src/lib/index.ts");
  });
});

describe("extractDependencies — Python", () => {
  const projectFiles = new Set(["mypackage/utils.py", "mypackage/__init__.py"]);

  it("extracts from-import statements", () => {
    const source = `from mypackage.utils import helper`;
    const tree = parse(source, pyLang);
    const deps = extractDependencies(
      tree.rootNode,
      "python",
      "main.py",
      projectFiles,
    );
    tree.delete();

    expect(deps).toHaveLength(1);
    expect(deps[0].importSpecifier).toBe("mypackage.utils");
    expect(deps[0].targetFile).toBe("mypackage/utils.py");
  });

  it("resolves package imports via __init__.py", () => {
    const source = `import mypackage`;
    const tree = parse(source, pyLang);
    const deps = extractDependencies(
      tree.rootNode,
      "python",
      "main.py",
      projectFiles,
    );
    tree.delete();

    expect(deps).toHaveLength(1);
    expect(deps[0].targetFile).toBe("mypackage/__init__.py");
  });
});
