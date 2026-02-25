/**
 * Database query module barrel export.
 */

export {
  createProject,
  getProject,
  getProjectByPath,
  getProjectBySlug,
  listProjects,
  updateProject,
  deleteProject,
  type CreateProjectOptions,
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
  getIndexRunsByProjectId,
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
  getSummariesByLevel,
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

export {
  insertBlueprint,
  bulkInsertBlueprints,
  getBlueprintsByProjectId,
  getBlueprint,
  deleteBlueprintsByProjectId,
  countBlueprintsByProjectId,
  type InsertBlueprintInput,
  type BlueprintRow,
} from "./blueprints.js";

export {
  insertBlueprintPlan,
  getBlueprintPlansByProjectId,
  getBlueprintPlan,
  deleteBlueprintPlansByProjectId,
  insertBlueprintPhase,
  getBlueprintPhasesByPlanId,
  getBlueprintPhase,
  updateBlueprintPhaseStatus,
  updateBlueprintPhaseNotes,
  updateBlueprintPhaseChatHistory,
  insertBlueprintMilestone,
  bulkInsertBlueprintMilestones,
  getBlueprintMilestonesByPhaseId,
  getBlueprintMilestone,
  updateBlueprintMilestoneDetails,
  updateBlueprintMilestoneField,
  updateBlueprintPhaseCostUsd,
  type BlueprintPlanRow,
  type BlueprintPhaseRow,
  type BlueprintMilestoneRow,
  type InsertBlueprintPlanInput,
  type InsertBlueprintPhaseInput,
  type InsertBlueprintMilestoneInput,
} from "./blueprint-plans.js";

export {
  createCredential,
  getCredential,
  listCredentials,
  updateCredential,
  deleteCredential,
  type CredentialRow,
  type CreateCredentialInput,
} from "./credentials.js";

export {
  createJob,
  claimNextJob,
  completeJob,
  failJob,
  cancelJob,
  getJobStatus,
  getJobsByProjectId,
  getPendingJobCount,
  resetStaleJobs,
  hasActiveJobForProject,
  listRecentIndexJobs,
  type JobRow,
  type JobOptions,
  type IndexJobWithProject,
} from "./jobs.js";

export { getDbSettings, saveDbSettings } from "./settings.js";

export {
  upsertReindexRequest,
  listReindexRequests,
  listReindexRequestsWithProjects,
  deleteReindexRequest,
  type ReindexRequestRow,
  type ReindexRequestWithProject,
} from "./reindex-requests.js";

export {
  createApiKey,
  listApiKeys,
  deleteApiKey,
  verifyApiKey,
  type ApiKeyRow,
  type CreateApiKeyInput,
  type CreateApiKeyResult,
} from "./api-keys.js";
