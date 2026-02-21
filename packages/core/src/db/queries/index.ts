/**
 * Database query module barrel export.
 */

export {
  createProject,
  getProject,
  getProjectByPath,
  listProjects,
  updateProject,
  deleteProject,
} from "./projects.js";

export {
  upsertFile,
  fileNeedsReindex,
  getFileByPath,
  getProjectFiles,
  deleteFilesByPaths,
  bulkUpsertFiles,
  updateFileDocContent,
  type UpsertFileInput,
  type FileRow,
} from "./files.js";

export {
  bulkInsertSymbols,
  deleteSymbolsByFileId,
  deleteSymbolsByProjectId,
  getSymbolsByFileId,
  getSymbolsByProjectId,
  type InsertSymbolInput,
  type SymbolRow,
} from "./symbols.js";

export {
  bulkInsertDependencies,
  deleteDependenciesBySourceFileId,
  deleteDependenciesByProjectId,
  getDependenciesByProjectId,
  getDependenciesBySourceFileId,
  type InsertDependencyInput,
  type DependencyRow,
} from "./dependencies.js";

export {
  createIndexRun,
  updateIndexRunProgress,
  completeIndexRun,
  failIndexRun,
  getLatestIndexRun,
  type IndexRunRow,
} from "./index-runs.js";

export {
  bulkInsertFindings,
  getFindingsByProjectId,
  getFindingsByProjectIdAndSeverity,
  deleteFindingsByProjectId,
  countFindingsByProjectId,
  type InsertFindingInput,
  type FindingRow,
} from "./findings.js";

export {
  insertSummary,
  bulkInsertSummaries,
  getSummaryByTargetId,
  getSummariesByProjectId,
  deleteSummariesByProjectId,
  getExistingInputHashes,
  type InsertSummaryInput,
  type SummaryRow,
} from "./summaries.js";

export {
  insertEmbedding,
  bulkInsertEmbeddings,
  deleteEmbeddingsByProjectId,
  similaritySearch,
  simpleSimilaritySearch,
  type InsertEmbeddingInput,
  type EmbeddingRow,
  type SimilaritySearchResult,
} from "./embeddings.js";
