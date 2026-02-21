/**
 * Code metrics computation.
 *
 * Computes:
 * - Cyclomatic complexity (per-file and per-function)
 * - Coupling (afferent + efferent)
 * - Cohesion (internal references / total symbols)
 */

import type Parser from "web-tree-sitter";
import type {
  DependencyEdge,
  ExtractedSymbol,
  FileMetrics,
  SupportedLanguage,
} from "../types.js";

type TSNode = Parser.SyntaxNode;

// ---------------------------------------------------------------------------
// Decision node types per language (for cyclomatic complexity)
// ---------------------------------------------------------------------------

/** Node types that represent decision points in the control flow. */
const DECISION_NODE_TYPES: Record<SupportedLanguage, ReadonlySet<string>> = {
  typescript: new Set([
    "if_statement",
    "else_clause",
    "for_statement",
    "for_in_statement",
    "while_statement",
    "do_statement",
    "switch_case",
    "catch_clause",
    "ternary_expression",
    "binary_expression",   // filtered to && || ?? below
  ]),
  tsx: new Set([
    "if_statement",
    "else_clause",
    "for_statement",
    "for_in_statement",
    "while_statement",
    "do_statement",
    "switch_case",
    "catch_clause",
    "ternary_expression",
    "binary_expression",
  ]),
  javascript: new Set([
    "if_statement",
    "else_clause",
    "for_statement",
    "for_in_statement",
    "while_statement",
    "do_statement",
    "switch_case",
    "catch_clause",
    "ternary_expression",
    "binary_expression",
  ]),
  python: new Set([
    "if_statement",
    "elif_clause",
    "for_statement",
    "while_statement",
    "except_clause",
    "conditional_expression",
    "boolean_operator",    // filtered to "and" / "or" below
  ]),
  c_sharp: new Set([
    "if_statement",
    "else_clause",
    "for_statement",
    "for_each_statement",
    "while_statement",
    "do_statement",
    "switch_section",
    "catch_clause",
    "conditional_expression",
    "binary_expression",
  ]),
};

/** Binary operators that count as decision points. */
const LOGICAL_OPERATORS = new Set(["&&", "||", "??", "and", "or"]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the cyclomatic complexity of a tree-sitter AST.
 *
 * Starts at 1 (one path through the code) and increments for each
 * decision node found.
 */
export function computeComplexity(
  rootNode: TSNode,
  language: SupportedLanguage,
): number {
  const decisionTypes = DECISION_NODE_TYPES[language];
  let complexity = 1;

  walkAll(rootNode, (node) => {
    if (decisionTypes.has(node.type)) {
      // For binary_expression / boolean_operator, only count logical operators
      if (node.type === "binary_expression" || node.type === "boolean_operator") {
        const operator = node.childForFieldName("operator");
        if (operator && LOGICAL_OPERATORS.has(operator.text)) {
          complexity++;
        }
      } else {
        complexity++;
      }
    }
  });

  return complexity;
}

/**
 * Compute cyclomatic complexity for a specific function node.
 */
export function computeFunctionComplexity(
  functionNode: TSNode,
  language: SupportedLanguage,
): number {
  return computeComplexity(functionNode, language);
}

/**
 * Compute file-level metrics from the dependency edges and symbols.
 *
 * @param filePath        — project-relative path
 * @param fileEdges       — edges where this file is the source
 * @param allEdges        — all dependency edges in the project
 * @param symbols         — symbols extracted from this file
 */
export function computeFileMetrics(
  filePath: string,
  fileEdges: readonly DependencyEdge[],
  allEdges: readonly DependencyEdge[],
  symbols: readonly ExtractedSymbol[],
): FileMetrics {
  // Efferent coupling: distinct target files this file imports
  const efferentTargets = new Set<string>();
  for (const edge of fileEdges) {
    if (edge.targetFile) {
      efferentTargets.add(edge.targetFile);
    }
  }

  // Afferent coupling: distinct source files that import this file
  const afferentSources = new Set<string>();
  for (const edge of allEdges) {
    if (edge.targetFile === filePath && edge.sourceFile !== filePath) {
      afferentSources.add(edge.sourceFile);
    }
  }

  // Cohesion: ratio of internal symbol references to total symbols
  // A simple heuristic: count how many of the file's own symbols are
  // referenced by other symbols in the same file (estimated by imports
  // that resolve to the same file being 0, meaning high cohesion when
  // there are few external dependencies relative to symbol count).
  const totalSymbols = symbols.filter(
    (s) => s.kind !== "import" && s.kind !== "export",
  ).length;

  const internalImports = fileEdges.filter(
    (e) => e.targetFile === filePath,
  ).length;

  let cohesion = 0;
  if (totalSymbols > 0) {
    // Simple model: cohesion = 1 - (external deps / total symbols)
    // clamped to [0, 1]
    const externalDeps = efferentTargets.size;
    cohesion = Math.max(0, Math.min(1, 1 - externalDeps / totalSymbols));
  }

  return {
    complexity: 0, // Set by the caller after AST analysis
    efferentCoupling: efferentTargets.size,
    afferentCoupling: afferentSources.size,
    cohesion,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Walk all nodes depth-first. */
function walkAll(node: TSNode, visitor: (node: TSNode) => void): void {
  visitor(node);
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      walkAll(child, visitor);
    }
  }
}
