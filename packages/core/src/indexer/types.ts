/**
 * Indexer pipeline types.
 *
 * Defines the context, results, and supporting types used throughout
 * the indexing pipeline.
 */

import type {
  DependencyKind,
  IndexStatus,
  LayerName,
  PrismConfig,
  Project,
  SymbolKind,
} from "../domain/types.js";

// ---------------------------------------------------------------------------
// File entry — a single file discovered by the file walker
// ---------------------------------------------------------------------------

/** Supported language identifier for tree-sitter parsing. */
export type SupportedLanguage = "typescript" | "tsx" | "javascript" | "python" | "c_sharp";

/** A file discovered by the file walker, ready for indexing. */
export interface FileEntry {
  /** Project-relative path (forward-slash separated). */
  path: string;
  /** Absolute path on disk. */
  absolutePath: string;
  /** Raw file content. */
  content: string;
  /** Detected language (null if unsupported). */
  language: SupportedLanguage | null;
  /** File size in bytes. */
  sizeBytes: number;
  /** Number of lines. */
  lineCount: number;
  /** SHA-256 hex digest of the file content. */
  contentHash: string;
}

// ---------------------------------------------------------------------------
// Extracted symbol
// ---------------------------------------------------------------------------

/** A symbol extracted from the AST. */
export interface ExtractedSymbol {
  kind: SymbolKind;
  name: string;
  startLine: number;
  endLine: number;
  exported: boolean;
  signature: string | null;
  docstring: string | null;
  /** Per-symbol cyclomatic complexity (for functions/methods). */
  complexity: number | null;
}

// ---------------------------------------------------------------------------
// Dependency edge
// ---------------------------------------------------------------------------

/** A dependency edge between two files. */
export interface DependencyEdge {
  /** Project-relative path of the file containing the import. */
  sourceFile: string;
  /** Raw import specifier (e.g. "./foo", "@prism/core"). */
  importSpecifier: string;
  /** Resolved project-relative path (null if external or unresolvable). */
  targetFile: string | null;
  /** Kind of dependency. */
  kind: DependencyKind;
}

// ---------------------------------------------------------------------------
// File metrics
// ---------------------------------------------------------------------------

/** Computed metrics for a single file. */
export interface FileMetrics {
  /** Cyclomatic complexity of the entire file. */
  complexity: number;
  /** Number of distinct files this file imports (efferent coupling). */
  efferentCoupling: number;
  /** Number of distinct files that import this file (afferent coupling). */
  afferentCoupling: number;
  /** Cohesion score: internal references / total symbols (0-1). */
  cohesion: number;
}

// ---------------------------------------------------------------------------
// Structural layer result for a single file
// ---------------------------------------------------------------------------

/** Result of processing one file through the structural layer. */
export interface StructuralFileResult {
  file: FileEntry;
  symbols: ExtractedSymbol[];
  dependencies: DependencyEdge[];
  /** Per-file cyclomatic complexity. */
  complexity: number;
}

// ---------------------------------------------------------------------------
// Layer result
// ---------------------------------------------------------------------------

/** The result of running one pipeline layer. */
export interface LayerResult {
  layer: LayerName;
  status: IndexStatus;
  filesProcessed: number;
  filesTotal: number;
  durationMs: number;
  costUsd: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Budget tracker (for LLM layers)
// ---------------------------------------------------------------------------

/** Tracks LLM API spend across layers. */
export interface BudgetTracker {
  /** Total budget in USD. */
  budgetUsd: number;
  /** Amount spent so far in USD. */
  spentUsd: number;
  /** Whether the budget has been exceeded. */
  readonly exceeded: boolean;
  /** Record spending. */
  record(amountUsd: number): void;
  /** Remaining budget in USD. */
  readonly remaining: number;
}

/** Create a new BudgetTracker with the given budget. */
export function createBudgetTracker(budgetUsd: number): BudgetTracker {
  const tracker: BudgetTracker = {
    budgetUsd,
    spentUsd: 0,
    get exceeded() {
      return this.spentUsd >= this.budgetUsd;
    },
    get remaining() {
      return Math.max(0, this.budgetUsd - this.spentUsd);
    },
    record(amountUsd: number) {
      this.spentUsd += amountUsd;
    },
  };
  return tracker;
}

// ---------------------------------------------------------------------------
// Index context — shared state for the pipeline
// ---------------------------------------------------------------------------

/** Shared context passed through the indexing pipeline. */
export interface IndexContext {
  project: Project;
  config: PrismConfig;
  /** Layers to execute in this run. */
  layers: LayerName[];
  /** If true, ignore incremental state and re-index everything. */
  fullReindex: boolean;
  /** Results accumulated from each layer. */
  results: LayerResult[];
  /** Budget tracker for LLM-consuming layers. */
  budget: BudgetTracker;
}
