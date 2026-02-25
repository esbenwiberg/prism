CREATE TABLE "prism_reindex_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"layers" jsonb NOT NULL DEFAULT '["structural"]',
	"requested_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "prism_reindex_requests_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "prism_reindex_requests" ADD CONSTRAINT "prism_reindex_requests_project_fk" FOREIGN KEY ("project_id") REFERENCES "prism_projects"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
