/**
 * Symbol extraction from tree-sitter ASTs.
 *
 * Walks the AST to extract functions, classes, interfaces, types, enums,
 * exports, and imports. Language-aware: TS/JS, Python, and C# each use
 * different node types.
 */

import type Parser from "web-tree-sitter";
import type { ExtractedSymbol, SupportedLanguage } from "../types.js";
import type { SymbolKind } from "../../domain/types.js";

type TSNode = Parser.SyntaxNode;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract symbols from a tree-sitter AST root node.
 */
export function extractSymbols(
  rootNode: TSNode,
  language: SupportedLanguage,
  sourceText: string,
): ExtractedSymbol[] {
  const symbols: ExtractedSymbol[] = [];

  switch (language) {
    case "typescript":
    case "tsx":
    case "javascript":
      extractTypeScriptSymbols(rootNode, symbols, sourceText);
      break;
    case "python":
      extractPythonSymbols(rootNode, symbols, sourceText);
      break;
    case "c_sharp":
      extractCSharpSymbols(rootNode, symbols, sourceText);
      break;
  }

  return symbols;
}

// ---------------------------------------------------------------------------
// TypeScript / JavaScript extraction
// ---------------------------------------------------------------------------

function extractTypeScriptSymbols(
  node: TSNode,
  symbols: ExtractedSymbol[],
  sourceText: string,
): void {
  walkNode(node, (current, parent) => {
    const type = current.type;

    // Function declarations
    if (type === "function_declaration") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          kind: "function",
          name: nameNode.text,
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
          exported: isExportedTS(current, parent),
          signature: extractFunctionSignatureTS(current, sourceText),
          docstring: extractPrecedingComment(current, sourceText),
          complexity: null,
        });
      }
    }

    // Arrow functions assigned to variables: const foo = () => { ... }
    if (type === "lexical_declaration" || type === "variable_declaration") {
      for (const declarator of current.namedChildren) {
        if (declarator.type === "variable_declarator") {
          const nameNode = declarator.childForFieldName("name");
          const valueNode = declarator.childForFieldName("value");
          if (
            nameNode &&
            valueNode &&
            (valueNode.type === "arrow_function" ||
              valueNode.type === "function_expression" ||
              valueNode.type === "function")
          ) {
            symbols.push({
              kind: "function",
              name: nameNode.text,
              startLine: current.startPosition.row + 1,
              endLine: current.endPosition.row + 1,
              exported: isExportedTS(current, parent),
              signature: extractArrowSignatureTS(nameNode, valueNode, sourceText),
              docstring: extractPrecedingComment(current, sourceText),
              complexity: null,
            });
          }
        }
      }
    }

    // Class declarations
    if (type === "class_declaration") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          kind: "class",
          name: nameNode.text,
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
          exported: isExportedTS(current, parent),
          signature: extractClassSignatureTS(current),
          docstring: extractPrecedingComment(current, sourceText),
          complexity: null,
        });
      }
    }

    // Interface declarations (TypeScript)
    if (type === "interface_declaration") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          kind: "interface",
          name: nameNode.text,
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
          exported: isExportedTS(current, parent),
          signature: `interface ${nameNode.text}`,
          docstring: extractPrecedingComment(current, sourceText),
          complexity: null,
        });
      }
    }

    // Type alias declarations (TypeScript)
    if (type === "type_alias_declaration") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          kind: "type",
          name: nameNode.text,
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
          exported: isExportedTS(current, parent),
          signature: `type ${nameNode.text}`,
          docstring: extractPrecedingComment(current, sourceText),
          complexity: null,
        });
      }
    }

    // Enum declarations (TypeScript)
    if (type === "enum_declaration") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          kind: "enum",
          name: nameNode.text,
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
          exported: isExportedTS(current, parent),
          signature: `enum ${nameNode.text}`,
          docstring: extractPrecedingComment(current, sourceText),
          complexity: null,
        });
      }
    }

    // Import statements
    if (type === "import_statement") {
      const source = current.childForFieldName("source");
      if (source) {
        symbols.push({
          kind: "import",
          name: source.text.replace(/['"]/g, ""),
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
          exported: false,
          signature: current.text,
          docstring: null,
          complexity: null,
        });
      }
    }

    // Export statements (re-exports like `export { foo } from './bar'`)
    if (type === "export_statement") {
      const source = current.childForFieldName("source");
      if (source) {
        symbols.push({
          kind: "export",
          name: source.text.replace(/['"]/g, ""),
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
          exported: true,
          signature: current.text,
          docstring: null,
          complexity: null,
        });
      }
    }
  });
}

function isExportedTS(node: TSNode, parent: TSNode | null): boolean {
  // Direct check: export keyword before the declaration
  if (parent?.type === "export_statement") return true;

  // Check if previous sibling is "export" keyword
  const prev = node.previousSibling;
  if (prev && prev.type === "export") return true;

  // Check text starts with "export"
  const firstChild = node.firstChild;
  if (firstChild && firstChild.type === "export") return true;

  return false;
}

function extractFunctionSignatureTS(node: TSNode, _sourceText: string): string {
  const nameNode = node.childForFieldName("name");
  const paramsNode = node.childForFieldName("parameters");
  const returnType = node.childForFieldName("return_type");

  let sig = "function";
  if (nameNode) sig += ` ${nameNode.text}`;
  if (paramsNode) sig += paramsNode.text;
  if (returnType) sig += `: ${returnType.text}`;

  return sig;
}

function extractArrowSignatureTS(
  nameNode: TSNode,
  valueNode: TSNode,
  _sourceText: string,
): string {
  const paramsNode = valueNode.childForFieldName("parameters");
  const returnType = valueNode.childForFieldName("return_type");

  let sig = `const ${nameNode.text}`;
  if (paramsNode) sig += ` = ${paramsNode.text}`;
  else sig += " = ()";
  if (returnType) sig += `: ${returnType.text}`;
  sig += " => ...";

  return sig;
}

function extractClassSignatureTS(node: TSNode): string {
  const nameNode = node.childForFieldName("name");
  let sig = "class";
  if (nameNode) sig += ` ${nameNode.text}`;

  // heritage (extends/implements)
  for (const child of node.namedChildren) {
    if (child.type === "class_heritage") {
      sig += ` ${child.text}`;
      break;
    }
  }

  return sig;
}

// ---------------------------------------------------------------------------
// Python extraction
// ---------------------------------------------------------------------------

function extractPythonSymbols(
  node: TSNode,
  symbols: ExtractedSymbol[],
  sourceText: string,
): void {
  walkNode(node, (current, _parent) => {
    const type = current.type;

    // Function definitions
    if (type === "function_definition") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          kind: "function",
          name: nameNode.text,
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
          exported: !nameNode.text.startsWith("_"),
          signature: extractPythonFunctionSignature(current),
          docstring: extractPythonDocstring(current),
          complexity: null,
        });
      }
    }

    // Class definitions
    if (type === "class_definition") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          kind: "class",
          name: nameNode.text,
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
          exported: !nameNode.text.startsWith("_"),
          signature: extractPythonClassSignature(current),
          docstring: extractPythonDocstring(current),
          complexity: null,
        });
      }
    }

    // Import statements
    if (type === "import_statement" || type === "import_from_statement") {
      const moduleName = current.childForFieldName("module_name");
      symbols.push({
        kind: "import",
        name: moduleName?.text ?? current.text,
        startLine: current.startPosition.row + 1,
        endLine: current.endPosition.row + 1,
        exported: false,
        signature: current.text,
        docstring: null,
        complexity: null,
      });
    }
  });
}

function extractPythonFunctionSignature(node: TSNode): string {
  const nameNode = node.childForFieldName("name");
  const paramsNode = node.childForFieldName("parameters");
  const returnType = node.childForFieldName("return_type");

  let sig = `def ${nameNode?.text ?? "?"}`;
  if (paramsNode) sig += paramsNode.text;
  if (returnType) sig += ` -> ${returnType.text}`;

  return sig;
}

function extractPythonClassSignature(node: TSNode): string {
  const nameNode = node.childForFieldName("name");
  const superclasses = node.childForFieldName("superclasses");

  let sig = `class ${nameNode?.text ?? "?"}`;
  if (superclasses) sig += superclasses.text;

  return sig;
}

function extractPythonDocstring(node: TSNode): string | null {
  const body = node.childForFieldName("body");
  if (!body) return null;

  const firstChild = body.firstNamedChild;
  if (firstChild?.type === "expression_statement") {
    const expr = firstChild.firstNamedChild;
    if (expr?.type === "string") {
      // Strip surrounding quotes
      const text = expr.text;
      return text.replace(/^(?:"""|'''|"|')/, "").replace(/(?:"""|'''|"|')$/, "").trim();
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// C# extraction
// ---------------------------------------------------------------------------

function extractCSharpSymbols(
  node: TSNode,
  symbols: ExtractedSymbol[],
  sourceText: string,
): void {
  walkNode(node, (current, _parent) => {
    const type = current.type;

    // Method declarations
    if (type === "method_declaration") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          kind: "function",
          name: nameNode.text,
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
          exported: isCSharpPublic(current),
          signature: extractCSharpMethodSignature(current),
          docstring: extractPrecedingComment(current, sourceText),
          complexity: null,
        });
      }
    }

    // Class declarations
    if (type === "class_declaration") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          kind: "class",
          name: nameNode.text,
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
          exported: isCSharpPublic(current),
          signature: `class ${nameNode.text}`,
          docstring: extractPrecedingComment(current, sourceText),
          complexity: null,
        });
      }
    }

    // Interface declarations
    if (type === "interface_declaration") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          kind: "interface",
          name: nameNode.text,
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
          exported: isCSharpPublic(current),
          signature: `interface ${nameNode.text}`,
          docstring: extractPrecedingComment(current, sourceText),
          complexity: null,
        });
      }
    }

    // Enum declarations
    if (type === "enum_declaration") {
      const nameNode = current.childForFieldName("name");
      if (nameNode) {
        symbols.push({
          kind: "enum",
          name: nameNode.text,
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
          exported: isCSharpPublic(current),
          signature: `enum ${nameNode.text}`,
          docstring: extractPrecedingComment(current, sourceText),
          complexity: null,
        });
      }
    }

    // Using directives (C# imports)
    if (type === "using_directive") {
      symbols.push({
        kind: "import",
        name: current.text.replace(/^using\s+/, "").replace(/;$/, "").trim(),
        startLine: current.startPosition.row + 1,
        endLine: current.endPosition.row + 1,
        exported: false,
        signature: current.text,
        docstring: null,
        complexity: null,
      });
    }
  });
}

function isCSharpPublic(node: TSNode): boolean {
  for (const child of node.children) {
    if (child.type === "modifier" || child.type === "public") {
      if (child.text === "public") return true;
    }
  }
  return false;
}

function extractCSharpMethodSignature(node: TSNode): string {
  const returnType = node.childForFieldName("type");
  const nameNode = node.childForFieldName("name");
  const paramsNode = node.childForFieldName("parameters");

  let sig = "";
  if (returnType) sig += `${returnType.text} `;
  sig += nameNode?.text ?? "?";
  if (paramsNode) sig += paramsNode.text;

  return sig;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/**
 * Walk a tree-sitter AST depth-first, calling `visitor` for each node.
 * The visitor receives the current node and its parent.
 */
function walkNode(
  node: TSNode,
  visitor: (node: TSNode, parent: TSNode | null) => void,
  parent: TSNode | null = null,
): void {
  visitor(node, parent);
  for (const child of node.namedChildren) {
    walkNode(child, visitor, node);
  }
}

/**
 * Extract a comment immediately preceding a node (JSDoc or line comment).
 */
function extractPrecedingComment(node: TSNode, sourceText: string): string | null {
  const prev = node.previousSibling;
  if (!prev) return null;

  if (prev.type === "comment") {
    const text = prev.text;
    // Strip comment markers
    if (text.startsWith("/**")) {
      return text
        .replace(/^\/\*\*\s*/, "")
        .replace(/\s*\*\/$/, "")
        .replace(/^\s*\* ?/gm, "")
        .trim();
    }
    if (text.startsWith("//")) {
      return text.replace(/^\/\/\s*/, "").trim();
    }
    if (text.startsWith("/*")) {
      return text
        .replace(/^\/\*\s*/, "")
        .replace(/\s*\*\/$/, "")
        .trim();
    }
    return text.trim();
  }

  return null;
}
