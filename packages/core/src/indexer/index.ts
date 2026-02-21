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
