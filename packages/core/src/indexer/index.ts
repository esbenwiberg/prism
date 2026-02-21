/**
 * Indexer module barrel export.
 *
 * Re-exports the pipeline orchestrator, types, and structural/docs sub-modules.
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

// Docs sub-modules
export {
  isDocumentationFile,
  parseReadme,
  parseDocFiles,
  parseMarkdownSections,
  type DocSection,
  type ReadmeParseResult,
} from "./docs/readme.js";

export {
  extractComments,
  extractCommentsFromFiles,
  extractJSComments,
  extractPythonComments,
  extractCSharpComments,
  type CommentKind,
  type ExtractedComment,
  type FileCommentsResult,
} from "./docs/comments.js";

export {
  isConfigurationFile,
  classifyConfigFile,
  parseConfigFiles,
  buildTechStack,
  buildConfigDocContent,
  type ConfigCategory,
  type ConfigInfo,
  type TechStackInfo,
} from "./docs/config.js";

export {
  assembleIntent,
  buildIntentDocContent,
  type ProjectIntent,
  type TechStackSummary,
  type ModuleIntent,
} from "./docs/intent.js";

// Analysis detectors
export {
  findSCCs,
  buildAdjacencyList,
  detectCircularDeps,
  detectDeadCode,
  type DepEdge,
  type DetectorFinding,
  type SymbolInfo,
  type SymbolReference,
} from "./analysis/detectors/index.js";

// Semantic sub-modules
export {
  estimateTokens,
  extractSymbolSource,
  buildFileContext,
  chunkFileSymbols,
  filterSummarisableSymbols,
  type SourceChunk,
} from "./semantic/chunker.js";

export {
  buildPrompt,
  computeInputHash,
  computeCost,
  summariseBatch,
  loadPromptTemplate,
  resetPromptTemplate,
  type SummariseInput,
  type SummaryResult,
} from "./semantic/summarizer.js";

export {
  createEmbedder,
  VoyageProvider,
  OpenAIProvider,
  type EmbeddingProvider,
} from "./semantic/embedder.js";
