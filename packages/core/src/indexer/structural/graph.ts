/**
 * Dependency graph builder.
 *
 * Extracts import statements from ASTs and resolves them to
 * project-relative file paths. Builds a list of DependencyEdge entries.
 */

import { dirname, join, posix } from "node:path";
import type Parser from "web-tree-sitter";
import type { DependencyEdge, SupportedLanguage } from "../types.js";
import type { DependencyKind } from "../../domain/types.js";

type TSNode = Parser.SyntaxNode;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract dependency edges from a tree-sitter AST root node.
 *
 * @param rootNode    — the AST root
 * @param language    — the file's language
 * @param filePath    — project-relative path of the source file
 * @param projectFiles — set of all known project-relative paths (for resolution)
 */
export function extractDependencies(
  rootNode: TSNode,
  language: SupportedLanguage,
  filePath: string,
  projectFiles: ReadonlySet<string>,
): DependencyEdge[] {
  switch (language) {
    case "typescript":
    case "tsx":
    case "javascript":
      return extractTSDependencies(rootNode, filePath, projectFiles);
    case "python":
      return extractPythonDependencies(rootNode, filePath, projectFiles);
    case "c_sharp":
      return extractCSharpDependencies(rootNode, filePath);
  }
}

// ---------------------------------------------------------------------------
// TypeScript / JavaScript
// ---------------------------------------------------------------------------

function extractTSDependencies(
  rootNode: TSNode,
  filePath: string,
  projectFiles: ReadonlySet<string>,
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const fileDir = dirname(filePath);

  walkTopLevel(rootNode, (node) => {
    // import ... from '...'
    if (node.type === "import_statement") {
      const source = node.childForFieldName("source");
      if (source) {
        const specifier = stripQuotes(source.text);
        edges.push({
          sourceFile: filePath,
          importSpecifier: specifier,
          targetFile: resolveJSImport(specifier, fileDir, projectFiles),
          kind: "import",
        });
      }
    }

    // export ... from '...'
    if (node.type === "export_statement") {
      const source = node.childForFieldName("source");
      if (source) {
        const specifier = stripQuotes(source.text);
        edges.push({
          sourceFile: filePath,
          importSpecifier: specifier,
          targetFile: resolveJSImport(specifier, fileDir, projectFiles),
          kind: "import",
        });
      }
    }

    // Dynamic imports: import('...')
    // Handled via call_expression with import arguments
    if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      if (fn?.type === "import") {
        const args = node.childForFieldName("arguments");
        if (args) {
          const firstArg = args.firstNamedChild;
          if (firstArg?.type === "string") {
            const specifier = stripQuotes(firstArg.text);
            edges.push({
              sourceFile: filePath,
              importSpecifier: specifier,
              targetFile: resolveJSImport(specifier, fileDir, projectFiles),
              kind: "call",
            });
          }
        }
      }
    }

    // require('...')
    if (node.type === "call_expression") {
      const fn = node.childForFieldName("function");
      if (fn?.type === "identifier" && fn.text === "require") {
        const args = node.childForFieldName("arguments");
        if (args) {
          const firstArg = args.firstNamedChild;
          if (firstArg?.type === "string") {
            const specifier = stripQuotes(firstArg.text);
            edges.push({
              sourceFile: filePath,
              importSpecifier: specifier,
              targetFile: resolveJSImport(specifier, fileDir, projectFiles),
              kind: "import",
            });
          }
        }
      }
    }
  });

  return edges;
}

/**
 * Resolve a JS/TS import specifier to a project-relative path.
 *
 * Handles:
 *  - Relative imports (./foo, ../bar)
 *  - Extension probing (.ts, .tsx, .js, .jsx, /index.ts, etc.)
 *  - Returns null for package imports (no leading dot)
 */
function resolveJSImport(
  specifier: string,
  fromDir: string,
  projectFiles: ReadonlySet<string>,
): string | null {
  // Non-relative specifier — external package
  if (!specifier.startsWith(".")) return null;

  const resolved = posix.normalize(posix.join(fromDir, specifier));

  // Try exact match first
  if (projectFiles.has(resolved)) return resolved;

  // Extension probing
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
  for (const ext of extensions) {
    const withExt = resolved + ext;
    if (projectFiles.has(withExt)) return withExt;
  }

  // Strip .js extension and try .ts (common ESM pattern: import './foo.js' → foo.ts)
  if (resolved.endsWith(".js")) {
    const withoutJs = resolved.slice(0, -3);
    for (const ext of [".ts", ".tsx"]) {
      const candidate = withoutJs + ext;
      if (projectFiles.has(candidate)) return candidate;
    }
  }

  // Index file probing
  for (const ext of extensions) {
    const indexPath = posix.join(resolved, `index${ext}`);
    if (projectFiles.has(indexPath)) return indexPath;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Python
// ---------------------------------------------------------------------------

function extractPythonDependencies(
  rootNode: TSNode,
  filePath: string,
  projectFiles: ReadonlySet<string>,
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];
  const fileDir = dirname(filePath);

  walkTopLevel(rootNode, (node) => {
    if (node.type === "import_statement") {
      // import foo.bar
      const moduleName = node.childForFieldName("name");
      if (moduleName) {
        const specifier = moduleName.text;
        edges.push({
          sourceFile: filePath,
          importSpecifier: specifier,
          targetFile: resolvePythonImport(specifier, fileDir, projectFiles),
          kind: "import",
        });
      }
    }

    if (node.type === "import_from_statement") {
      // from foo.bar import baz
      const moduleName = node.childForFieldName("module_name");
      if (moduleName) {
        const specifier = moduleName.text;
        edges.push({
          sourceFile: filePath,
          importSpecifier: specifier,
          targetFile: resolvePythonImport(specifier, fileDir, projectFiles),
          kind: "import",
        });
      }
    }
  });

  return edges;
}

function resolvePythonImport(
  specifier: string,
  _fromDir: string,
  projectFiles: ReadonlySet<string>,
): string | null {
  // Convert dotted module name to path
  const asPath = specifier.replace(/\./g, "/");

  // Try as a .py file
  if (projectFiles.has(`${asPath}.py`)) return `${asPath}.py`;

  // Try as a package (__init__.py)
  const initPath = posix.join(asPath, "__init__.py");
  if (projectFiles.has(initPath)) return initPath;

  return null;
}

// ---------------------------------------------------------------------------
// C# (using directives → namespace-based, not file-based)
// ---------------------------------------------------------------------------

function extractCSharpDependencies(
  rootNode: TSNode,
  filePath: string,
): DependencyEdge[] {
  const edges: DependencyEdge[] = [];

  walkTopLevel(rootNode, (node) => {
    if (node.type === "using_directive") {
      const nameNode = node.childForFieldName("name");
      if (nameNode) {
        edges.push({
          sourceFile: filePath,
          importSpecifier: nameNode.text,
          targetFile: null, // C# uses namespaces, not direct file resolution
          kind: "import",
        });
      }
    }
  });

  return edges;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Walk only the top-level children (and recurse into namespaces/modules). */
function walkTopLevel(
  node: TSNode,
  visitor: (node: TSNode) => void,
): void {
  for (const child of node.namedChildren) {
    visitor(child);
    // Recurse into module/namespace blocks to find nested imports
    if (
      child.type === "module" ||
      child.type === "namespace_declaration" ||
      child.type === "block"
    ) {
      walkTopLevel(child, visitor);
    }
  }
}

/** Remove surrounding quotes from a string literal. */
function stripQuotes(text: string): string {
  return text.replace(/^['"`]|['"`]$/g, "");
}
