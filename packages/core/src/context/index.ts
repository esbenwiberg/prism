/**
 * Context enricher module barrel export.
 */

export type {
  ContextRequest,
  ContextSection,
  ContextResponse,
  ContextType,
  SignalResult,
  SignalItem,
} from "./types.js";

export {
  assembleFileContext,
  assembleModuleContext,
  assembleRelatedFiles,
  assembleArchitectureOverview,
  assembleChangeContext,
  assembleReviewContext,
  type FileContextInput,
  type ModuleContextInput,
  type RelatedFilesInput,
  type RelatedFileResult,
  type ArchitectureOverviewInput,
  type ChangeContextInput,
  type ReviewContextInput,
  assembleTaskContext,
  type TaskContextInput,
} from "./assembler.js";

export { formatContextAsMarkdown } from "./formatter.js";
export { estimateTokenCount, truncateSections, signalsToSections } from "./truncator.js";
export { computeRelevance, mergeRankedItems, type RankOptions } from "./ranker.js";
