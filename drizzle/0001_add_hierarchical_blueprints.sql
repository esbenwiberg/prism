CREATE TABLE "prism_blueprint_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"goal" text,
	"summary" text NOT NULL,
	"non_goals" jsonb,
	"acceptance_criteria" jsonb,
	"risks" jsonb,
	"model" text,
	"cost_usd" numeric(10, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prism_blueprint_phases" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"phase_order" integer NOT NULL,
	"title" text NOT NULL,
	"intent" text,
	"milestone_count" integer,
	"model" text,
	"cost_usd" numeric(10, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prism_blueprint_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"milestone_order" integer NOT NULL,
	"title" text NOT NULL,
	"intent" text,
	"key_files" jsonb,
	"verification" text,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prism_blueprint_plans" ADD CONSTRAINT "prism_blueprint_plans_project_id_prism_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."prism_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "prism_blueprint_phases" ADD CONSTRAINT "prism_blueprint_phases_plan_id_prism_blueprint_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."prism_blueprint_plans"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "prism_blueprint_phases" ADD CONSTRAINT "prism_blueprint_phases_project_id_prism_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."prism_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "prism_blueprint_milestones" ADD CONSTRAINT "prism_blueprint_milestones_phase_id_prism_blueprint_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."prism_blueprint_phases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "prism_blueprint_milestones" ADD CONSTRAINT "prism_blueprint_milestones_project_id_prism_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."prism_projects"("id") ON DELETE cascade ON UPDATE no action;
