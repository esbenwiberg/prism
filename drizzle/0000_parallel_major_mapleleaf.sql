CREATE TABLE "prism_blueprints" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"subsystem" text,
	"summary" text,
	"proposed_architecture" text,
	"module_changes" jsonb,
	"migration_path" text,
	"risks" jsonb,
	"rationale" text,
	"model" text,
	"cost_usd" numeric(10, 4)
);
--> statement-breakpoint
CREATE TABLE "prism_dependencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"source_file_id" integer NOT NULL,
	"target_file_id" integer,
	"source_symbol_id" integer,
	"target_symbol_id" integer,
	"kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prism_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"summary_id" integer NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"model" text
);
--> statement-breakpoint
CREATE TABLE "prism_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"path" text NOT NULL,
	"language" text,
	"size_bytes" integer,
	"line_count" integer,
	"content_hash" text,
	"complexity" numeric(8, 2),
	"coupling" numeric(8, 2),
	"cohesion" numeric(8, 2),
	"is_doc" boolean DEFAULT false NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"is_config" boolean DEFAULT false NOT NULL,
	"doc_content" text,
	"metadata" jsonb,
	CONSTRAINT "prism_files_project_path" UNIQUE("project_id","path")
);
--> statement-breakpoint
CREATE TABLE "prism_findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"evidence" jsonb,
	"suggestion" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prism_index_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"layer" text NOT NULL,
	"status" text NOT NULL,
	"files_processed" integer,
	"files_total" integer,
	"cost_usd" numeric(10, 4),
	"duration_ms" integer,
	"error" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prism_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"language" text,
	"total_files" integer,
	"total_symbols" integer,
	"index_status" text DEFAULT 'pending' NOT NULL,
	"last_indexed_commit" text,
	"settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prism_projects_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "prism_summaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"level" text NOT NULL,
	"target_id" text NOT NULL,
	"content" text NOT NULL,
	"model" text,
	"input_hash" text,
	"cost_usd" numeric(10, 4)
);
--> statement-breakpoint
CREATE TABLE "prism_symbols" (
	"id" serial PRIMARY KEY NOT NULL,
	"file_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"start_line" integer,
	"end_line" integer,
	"exported" boolean DEFAULT false NOT NULL,
	"signature" text,
	"docstring" text,
	"complexity" numeric(8, 2)
);
--> statement-breakpoint
ALTER TABLE "prism_blueprints" ADD CONSTRAINT "prism_blueprints_project_id_prism_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."prism_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_dependencies" ADD CONSTRAINT "prism_dependencies_project_id_prism_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."prism_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_dependencies" ADD CONSTRAINT "prism_dependencies_source_file_id_prism_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."prism_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_dependencies" ADD CONSTRAINT "prism_dependencies_target_file_id_prism_files_id_fk" FOREIGN KEY ("target_file_id") REFERENCES "public"."prism_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_dependencies" ADD CONSTRAINT "prism_dependencies_source_symbol_id_prism_symbols_id_fk" FOREIGN KEY ("source_symbol_id") REFERENCES "public"."prism_symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_dependencies" ADD CONSTRAINT "prism_dependencies_target_symbol_id_prism_symbols_id_fk" FOREIGN KEY ("target_symbol_id") REFERENCES "public"."prism_symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_embeddings" ADD CONSTRAINT "prism_embeddings_project_id_prism_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."prism_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_embeddings" ADD CONSTRAINT "prism_embeddings_summary_id_prism_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."prism_summaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_files" ADD CONSTRAINT "prism_files_project_id_prism_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."prism_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_findings" ADD CONSTRAINT "prism_findings_project_id_prism_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."prism_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_index_runs" ADD CONSTRAINT "prism_index_runs_project_id_prism_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."prism_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_summaries" ADD CONSTRAINT "prism_summaries_project_id_prism_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."prism_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_symbols" ADD CONSTRAINT "prism_symbols_file_id_prism_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."prism_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prism_symbols" ADD CONSTRAINT "prism_symbols_project_id_prism_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."prism_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prism_embeddings_hnsw_idx" ON "prism_embeddings" USING hnsw ("embedding" vector_cosine_ops);