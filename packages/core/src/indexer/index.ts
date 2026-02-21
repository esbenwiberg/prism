/**
 * Indexer module barrel export.
 *
 * Re-exports the pipeline orchestrator, types, and structural sub-modules.
 */

// Pipeline
export { runPipeline, walkProjectFiles } from "./pipeline.js";

// Types
export {
  createBudgetTracker,
  type BudgetTracker,
  type DependencyEdge,
  type ExtractedSymbol,
  type FileEntry,
  type FileMetrics,
  type IndexContext,
  type LayerResult,
  type StructuralFileResult,
  type SupportedLanguage,
} from "./types.js";

// Structural sub-modules
export {
  detectLanguage,
  getSupportedExtensions,
  getSupportedLanguages,
  getGrammarPath,
  isSupportedLanguage,
} from "./structural/languages.js";

export {
  initTreeSitter,
  loadLanguage,
  parseSource,
  resetParserCache,
} from "./structural/parser.js";

export { extractSymbols } from "./structural/extractor.js";
export { extractDependencies } from "./structural/graph.js";
export {
  computeComplexity,
  computeFunctionComplexity,
  computeFileMetrics,
} from "./structural/metrics.js";
