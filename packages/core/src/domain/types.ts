/**
 * Domain types for Prism.
 *
 * Enums are defined as string-literal unions for lightweight serialisation
 * and Drizzle compatibility. Interfaces match the database schema where
 * applicable.
 */

// ---------------------------------------------------------------------------
// Enums (string-literal unions)
// ---------------------------------------------------------------------------

/** Status of a project's index. */
export type IndexStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "partial";

/** Name of each indexing pipeline layer. */
export type LayerName =
  | "structural"
  | "docs"
  | "purpose"
  | "semantic"
  | "analysis"
  | "blueprint";

/** Kind of source-code symbol extracted during structural indexing. */
export type SymbolKind =
  | "function"
  | "class"
  | "interface"
  | "type"
  | "export"
  | "import"
  | "enum";

/** Kind of dependency edge between files or symbols. */
export type DependencyKind = "import" | "call" | "extends" | "implements";

/** Category of an analysis finding. */
export type FindingCategory =
  | "circular-dep"
  | "god-module"
  | "dead-code"
  | "layering"
  | "coupling"
  | "gap"
  | "tech-debt";

/** Severity of an analysis finding. */
export type FindingSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info";

/** Granularity level for summaries. */
export type SummaryLevel = "function" | "file" | "module" | "system";

/** Status of a background job. */
export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

/** Type of background job. */
export type JobType = "index" | "blueprint";

/** Git hosting provider for credentials. */
export type GitProvider = "github" | "azuredevops";

// ---------------------------------------------------------------------------
// Configuration interfaces
// ---------------------------------------------------------------------------

export interface StructuralConfig {
  skipPatterns: string[];
  maxFileSizeBytes: number;
}

export interface SemanticConfig {
  enabled: boolean;
  model: string;
  embeddingProvider: string;
  embeddingModel: string;
  embeddingDimensions: number;
  budgetUsd: number;
}

export interface PurposeConfig {
  enabled: boolean;
  model: string;
  budgetUsd: number;
}

export interface AnalysisConfig {
  enabled: boolean;
  model: string;
  budgetUsd: number;
}

export interface BlueprintConfig {
  enabled: boolean;
  model: string;
  budgetUsd: number;
}

export interface IndexerConfig {
  batchSize: number;
  maxConcurrentBatches: number;
  incrementalByDefault: boolean;
}

export interface DashboardConfig {
  port: number;
}

export interface ApiKeysConfig {
  anthropicApiKey: string;
  azureOpenaiApiKey: string;
  azureOpenaiEndpoint: string;
  voyageApiKey: string;
  openaiApiKey: string;
}

/** Top-level Prism configuration loaded from `prism.config.yaml`. */
export interface PrismConfig {
  structural: StructuralConfig;
  purpose: PurposeConfig;
  semantic: SemanticConfig;
  analysis: AnalysisConfig;
  blueprint: BlueprintConfig;
  indexer: IndexerConfig;
  dashboard: DashboardConfig;
  apiKeys: ApiKeysConfig;
}

// ---------------------------------------------------------------------------
// Domain entities
// ---------------------------------------------------------------------------

/** A registered project, matching the prism_projects table. */
export interface Project {
  id: number;
  name: string;
  path: string;
  language: string | null;
  totalFiles: number | null;
  totalSymbols: number | null;
  indexStatus: IndexStatus;
  lastIndexedCommit: string | null;
  settings: Record<string, unknown> | null;
  gitUrl: string | null;
  slug: string | null;
  credentialId: number | null;
  createdAt: Date;
  updatedAt: Date;
}
