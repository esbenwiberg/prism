/**
 * Tests for symbol extraction from tree-sitter ASTs.
 */

import { describe, it, expect, beforeAll } from "vitest";
import Parser from "web-tree-sitter";
import { extractSymbols } from "./extractor.js";
import { getGrammarPath } from "./languages.js";

let tsLang: Parser.Language;
let pyLang: Parser.Language;
let jsLang: Parser.Language;

beforeAll(async () => {
  await Parser.init();
  tsLang = await Parser.Language.load(getGrammarPath("typescript"));
  pyLang = await Parser.Language.load(getGrammarPath("python"));
  jsLang = await Parser.Language.load(getGrammarPath("javascript"));
});

function parse(source: string, lang: Parser.Language): Parser.Tree {
  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(source);
  parser.delete();
  return tree;
}

describe("extractSymbols — TypeScript", () => {
  it("extracts a function declaration", () => {
    const source = `function greet(name: string): void {
  console.log(name);
}`;
    const tree = parse(source, tsLang);
    const symbols = extractSymbols(tree.rootNode, "typescript", source);
    tree.delete();

    const fn = symbols.find((s) => s.kind === "function" && s.name === "greet");
    expect(fn).toBeDefined();
    expect(fn!.startLine).toBe(1);
    expect(fn!.endLine).toBe(3);
    expect(fn!.exported).toBe(false);
  });

  it("extracts an exported function", () => {
    const source = `export function add(a: number, b: number): number {
  return a + b;
}`;
    const tree = parse(source, tsLang);
    const symbols = extractSymbols(tree.rootNode, "typescript", source);
    tree.delete();

    const fn = symbols.find((s) => s.kind === "function" && s.name === "add");
    expect(fn).toBeDefined();
    expect(fn!.exported).toBe(true);
  });

  it("extracts a class declaration", () => {
    const source = `export class Foo {
  bar(): void {}
}`;
    const tree = parse(source, tsLang);
    const symbols = extractSymbols(tree.rootNode, "typescript", source);
    tree.delete();

    const cls = symbols.find((s) => s.kind === "class" && s.name === "Foo");
    expect(cls).toBeDefined();
    expect(cls!.exported).toBe(true);
  });

  it("extracts an interface declaration", () => {
    const source = `export interface Config {
  port: number;
}`;
    const tree = parse(source, tsLang);
    const symbols = extractSymbols(tree.rootNode, "typescript", source);
    tree.delete();

    const iface = symbols.find(
      (s) => s.kind === "interface" && s.name === "Config",
    );
    expect(iface).toBeDefined();
    expect(iface!.exported).toBe(true);
  });

  it("extracts a type alias", () => {
    const source = `export type ID = string | number;`;
    const tree = parse(source, tsLang);
    const symbols = extractSymbols(tree.rootNode, "typescript", source);
    tree.delete();

    const t = symbols.find((s) => s.kind === "type" && s.name === "ID");
    expect(t).toBeDefined();
  });

  it("extracts an enum declaration", () => {
    const source = `export enum Color { Red, Green, Blue }`;
    const tree = parse(source, tsLang);
    const symbols = extractSymbols(tree.rootNode, "typescript", source);
    tree.delete();

    const e = symbols.find((s) => s.kind === "enum" && s.name === "Color");
    expect(e).toBeDefined();
  });

  it("extracts import statements", () => {
    const source = `import { readFile } from "node:fs/promises";`;
    const tree = parse(source, tsLang);
    const symbols = extractSymbols(tree.rootNode, "typescript", source);
    tree.delete();

    const imp = symbols.find((s) => s.kind === "import");
    expect(imp).toBeDefined();
    expect(imp!.name).toBe("node:fs/promises");
  });

  it("extracts arrow function assigned to const", () => {
    const source = `export const double = (n: number): number => n * 2;`;
    const tree = parse(source, tsLang);
    const symbols = extractSymbols(tree.rootNode, "typescript", source);
    tree.delete();

    const fn = symbols.find(
      (s) => s.kind === "function" && s.name === "double",
    );
    expect(fn).toBeDefined();
    expect(fn!.exported).toBe(true);
  });
});

describe("extractSymbols — Python", () => {
  it("extracts a function definition", () => {
    const source = `def greet(name: str) -> None:
    print(name)
`;
    const tree = parse(source, pyLang);
    const symbols = extractSymbols(tree.rootNode, "python", source);
    tree.delete();

    const fn = symbols.find((s) => s.kind === "function" && s.name === "greet");
    expect(fn).toBeDefined();
    expect(fn!.startLine).toBe(1);
    expect(fn!.exported).toBe(true); // no underscore prefix
  });

  it("marks private functions as not exported", () => {
    const source = `def _helper():
    pass
`;
    const tree = parse(source, pyLang);
    const symbols = extractSymbols(tree.rootNode, "python", source);
    tree.delete();

    const fn = symbols.find(
      (s) => s.kind === "function" && s.name === "_helper",
    );
    expect(fn).toBeDefined();
    expect(fn!.exported).toBe(false);
  });

  it("extracts a class definition", () => {
    const source = `class MyClass:
    pass
`;
    const tree = parse(source, pyLang);
    const symbols = extractSymbols(tree.rootNode, "python", source);
    tree.delete();

    const cls = symbols.find(
      (s) => s.kind === "class" && s.name === "MyClass",
    );
    expect(cls).toBeDefined();
  });

  it("extracts imports", () => {
    const source = `from os.path import join`;
    const tree = parse(source, pyLang);
    const symbols = extractSymbols(tree.rootNode, "python", source);
    tree.delete();

    const imp = symbols.find((s) => s.kind === "import");
    expect(imp).toBeDefined();
  });
});

describe("extractSymbols — JavaScript", () => {
  it("extracts a function declaration", () => {
    const source = `function hello() { return "hi"; }`;
    const tree = parse(source, jsLang);
    const symbols = extractSymbols(tree.rootNode, "javascript", source);
    tree.delete();

    const fn = symbols.find(
      (s) => s.kind === "function" && s.name === "hello",
    );
    expect(fn).toBeDefined();
  });
});
