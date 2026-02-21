CREATE TABLE "prism_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prism_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"options" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "prism_projects" ADD COLUMN "git_url" text;
--> statement-breakpoint
ALTER TABLE "prism_projects" ADD COLUMN "credential_id" integer;
--> statement-breakpoint
ALTER TABLE "prism_jobs" ADD CONSTRAINT "prism_jobs_project_id_prism_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."prism_projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "prism_projects" ADD CONSTRAINT "prism_projects_credential_id_prism_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."prism_credentials"("id") ON DELETE set null ON UPDATE no action;
