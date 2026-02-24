/**
 * Drizzle ORM schema for Prism.
 *
 * All tables use the `prism_` prefix. PostgreSQL + pgvector.
 */

import {
  boolean,
  halfvec,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// prism_credentials
// ---------------------------------------------------------------------------
export const credentials = pgTable("prism_credentials", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  provider: text("provider").notNull(),
  encryptedToken: text("encrypted_token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// prism_projects
// ---------------------------------------------------------------------------
export const projects = pgTable("prism_projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  path: text("path").notNull().unique(),
  language: text("language"),
  totalFiles: integer("total_files"),
  totalSymbols: integer("total_symbols"),
  indexStatus: text("index_status").notNull().default("pending"),
  lastIndexedCommit: text("last_indexed_commit"),
  settings: jsonb("settings"),
  gitUrl: text("git_url"),
  slug: text("slug"),
  credentialId: integer("credential_id").references(() => credentials.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// prism_files
// ---------------------------------------------------------------------------
export const files = pgTable(
  "prism_files",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    language: text("language"),
    sizeBytes: integer("size_bytes"),
    lineCount: integer("line_count"),
    contentHash: text("content_hash"),
    complexity: numeric("complexity", { precision: 8, scale: 2 }),
    coupling: numeric("coupling", { precision: 8, scale: 2 }),
    cohesion: numeric("cohesion", { precision: 8, scale: 2 }),
    isDoc: boolean("is_doc").notNull().default(false),
    isTest: boolean("is_test").notNull().default(false),
    isConfig: boolean("is_config").notNull().default(false),
    docContent: text("doc_content"),
    metadata: jsonb("metadata"),
  },
  (table) => [
    unique("prism_files_project_path").on(table.projectId, table.path),
  ],
);

// ---------------------------------------------------------------------------
// prism_symbols
// ---------------------------------------------------------------------------
export const symbols = pgTable("prism_symbols", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  name: text("name").notNull(),
  startLine: integer("start_line"),
  endLine: integer("end_line"),
  exported: boolean("exported").notNull().default(false),
  signature: text("signature"),
  docstring: text("docstring"),
  complexity: numeric("complexity", { precision: 8, scale: 2 }),
});

// ---------------------------------------------------------------------------
// prism_dependencies
// ---------------------------------------------------------------------------
export const dependencies = pgTable("prism_dependencies", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sourceFileId: integer("source_file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  targetFileId: integer("target_file_id").references(() => files.id, {
    onDelete: "cascade",
  }),
  sourceSymbolId: integer("source_symbol_id").references(() => symbols.id, {
    onDelete: "cascade",
  }),
  targetSymbolId: integer("target_symbol_id").references(() => symbols.id, {
    onDelete: "cascade",
  }),
  kind: text("kind").notNull(),
});

// ---------------------------------------------------------------------------
// prism_summaries
// ---------------------------------------------------------------------------
export const summaries = pgTable("prism_summaries", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  level: text("level").notNull(),
  targetId: text("target_id").notNull(),
  content: text("content").notNull(),
  model: text("model"),
  inputHash: text("input_hash"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }),
});

// ---------------------------------------------------------------------------
// prism_embeddings
// ---------------------------------------------------------------------------
export const embeddings = pgTable(
  "prism_embeddings",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    summaryId: integer("summary_id")
      .notNull()
      .references(() => summaries.id, { onDelete: "cascade" }),
    embedding: halfvec("embedding", { dimensions: 3072 }).notNull(),
    model: text("model"),
  },
  (table) => [
    index("prism_embeddings_hnsw_idx").using(
      "hnsw",
      table.embedding.op("halfvec_cosine_ops"),
    ),
  ],
);

// ---------------------------------------------------------------------------
// prism_findings
// ---------------------------------------------------------------------------
export const findings = pgTable("prism_findings", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  category: text("category").notNull(),
  severity: text("severity").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  evidence: jsonb("evidence"),
  suggestion: text("suggestion"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// prism_blueprints (legacy — to be removed after migration to hierarchical)
// ---------------------------------------------------------------------------
export const blueprints = pgTable("prism_blueprints", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  subsystem: text("subsystem"),
  summary: text("summary"),
  proposedArchitecture: text("proposed_architecture"),
  moduleChanges: jsonb("module_changes"),
  migrationPath: text("migration_path"),
  risks: jsonb("risks"),
  rationale: text("rationale"),
  model: text("model"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }),
});

// ---------------------------------------------------------------------------
// prism_blueprint_plans (master blueprint)
// ---------------------------------------------------------------------------
export const blueprintPlans = pgTable("prism_blueprint_plans", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  goal: text("goal"),
  summary: text("summary").notNull(),
  nonGoals: jsonb("non_goals"),
  acceptanceCriteria: jsonb("acceptance_criteria"),
  risks: jsonb("risks"),
  model: text("model"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// prism_blueprint_phases (one per phase)
// ---------------------------------------------------------------------------
export const blueprintPhases = pgTable("prism_blueprint_phases", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id")
    .notNull()
    .references(() => blueprintPlans.id, { onDelete: "cascade" }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  phaseOrder: integer("phase_order").notNull(),
  title: text("title").notNull(),
  intent: text("intent"),
  milestoneCount: integer("milestone_count"),
  model: text("model"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }),
  /** Free-form markdown notes, user-editable per phase. */
  notes: text("notes"),
  /** Review status: 'draft' | 'accepted'. */
  status: text("status").notNull().default("draft"),
  /** Conversation history for AI phase review. */
  chatHistory: jsonb("chat_history"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// prism_blueprint_milestones (N per phase)
// ---------------------------------------------------------------------------
export const blueprintMilestones = pgTable("prism_blueprint_milestones", {
  id: serial("id").primaryKey(),
  phaseId: integer("phase_id")
    .notNull()
    .references(() => blueprintPhases.id, { onDelete: "cascade" }),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  milestoneOrder: integer("milestone_order").notNull(),
  title: text("title").notNull(),
  intent: text("intent"),
  keyFiles: jsonb("key_files"),
  verification: text("verification"),
  details: text("details"),
  /** Architectural decisions made for this milestone (alternatives + rationale). */
  decisions: jsonb("decisions"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// prism_index_runs
// ---------------------------------------------------------------------------
export const indexRuns = pgTable("prism_index_runs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  layer: text("layer").notNull(),
  status: text("status").notNull(),
  filesProcessed: integer("files_processed"),
  filesTotal: integer("files_total"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 4 }),
  durationMs: integer("duration_ms"),
  error: text("error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
});

// ---------------------------------------------------------------------------
// prism_settings (singleton row — global configuration stored in DB)
// ---------------------------------------------------------------------------
export const globalSettings = pgTable("prism_settings", {
  id: integer("id").primaryKey().default(1),
  settings: jsonb("settings").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// prism_jobs
// ---------------------------------------------------------------------------
export const jobs = pgTable("prism_jobs", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  status: text("status").notNull().default("pending"),
  options: jsonb("options"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
