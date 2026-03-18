/**
 * Dependency graph builder.
 *
 * Extracts import statements from ASTs and resolves them to
 * project-relative file paths. Builds a list of DependencyEdge entries.
 */

import { dirname, join, posix } from "node:path";
import type Parser from "web-tree-sitter";
import type { DependencyEdge, StructuralFileResult, SupportedLanguage } from "../types.js";
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
// C# (using directives → namespace-based, resolved via namespace map)
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
          targetFile: null, // Resolved later by resolveCSharpNamespaces()
          kind: "import",
        });
      }
    }
  });

  return edges;
}

/**
 * Extract the namespace declared in a C# AST.
 *
 * Handles both block-scoped (`namespace Foo.Bar { ... }`) and
 * file-scoped (`namespace Foo.Bar;`) declarations. Returns null
 * if no namespace declaration is found (rare but valid for top-level code).
 */
export function extractCSharpNamespace(rootNode: TSNode): string | null {
  for (const child of rootNode.namedChildren) {
    if (child.type === "namespace_declaration") {
      const nameNode = child.childForFieldName("name");
      return nameNode?.text ?? null;
    }
    // File-scoped namespace: `namespace Foo.Bar;`
    if (child.type === "file_scoped_namespace_declaration") {
      const nameNode = child.childForFieldName("name");
      return nameNode?.text ?? null;
    }
  }
  return null;
}

/**
 * Post-process structural results to resolve C# `using` directives
 * to actual file paths via a namespace → files mapping.
 *
 * Call this after all files have been through the structural pass.
 * Mutates the dependency edges in-place.
 *
 * Strategy:
 * 1. Build a map of declared namespace → file paths from all C# files
 * 2. For each unresolved C# `using X.Y.Z` edge, find files declaring
 *    that namespace (or a parent namespace containing matching types)
 * 3. Set `targetFile` to the resolved path
 *
 * A single namespace may map to multiple files (partial classes, etc).
 * In that case, all files are linked as separate dependency edges.
 */
export function resolveCSharpNamespaces(
  results: StructuralFileResult[],
  namespaceMap: Map<string, string>,
): void {
  // Build namespace → file paths lookup (one namespace can span multiple files)
  const nsToFiles = new Map<string, string[]>();
  for (const [filePath, ns] of namespaceMap) {
    const existing = nsToFiles.get(ns);
    if (existing) {
      existing.push(filePath);
    } else {
      nsToFiles.set(ns, [filePath]);
    }
  }

  for (const result of results) {
    if (result.file.language !== "c_sharp") continue;

    const newEdges: DependencyEdge[] = [];

    for (const edge of result.dependencies) {
      if (edge.targetFile != null || edge.kind !== "import") continue;

      const usingNs = edge.importSpecifier;
      const resolved = resolveUsingDirective(usingNs, nsToFiles, result.file.path);

      if (resolved.length === 0) {
        // Unresolvable (external assembly or unindexed) — keep as-is
        continue;
      }

      // First match replaces the original edge
      edge.targetFile = resolved[0];

      // Additional matches become new edges (e.g. partial classes)
      for (let i = 1; i < resolved.length; i++) {
        newEdges.push({
          sourceFile: edge.sourceFile,
          importSpecifier: usingNs,
          targetFile: resolved[i],
          kind: "import",
        });
      }
    }

    if (newEdges.length > 0) {
      result.dependencies.push(...newEdges);
    }
  }
}

/**
 * Resolve a `using X.Y.Z` directive to file paths.
 *
 * Tries exact namespace match first, then walks up the namespace
 * hierarchy to find parent namespaces (handles `using Foo.Bar` when
 * files declare `namespace Foo.Bar.Baz` — less common but valid).
 */
function resolveUsingDirective(
  usingNs: string,
  nsToFiles: Map<string, string[]>,
  sourceFile: string,
): string[] {
  // Exact match: `using Foo.Bar` → files declaring `namespace Foo.Bar`
  const exact = nsToFiles.get(usingNs);
  if (exact) {
    return exact.filter((f) => f !== sourceFile);
  }

  // Child namespace match: `using Foo.Bar` might match files in
  // `Foo.Bar.Something` — collect all files whose namespace starts
  // with the using directive as a prefix.
  // Cap at 20 to avoid explosion for very broad namespace imports.
  const prefix = usingNs + ".";
  const childMatches: string[] = [];
  for (const [ns, files] of nsToFiles) {
    if (ns.startsWith(prefix)) {
      for (const f of files) {
        if (f !== sourceFile) {
          childMatches.push(f);
          if (childMatches.length >= 20) return childMatches;
        }
      }
    }
  }

  return childMatches;
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
