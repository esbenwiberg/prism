ALTER TABLE "prism_summaries" ADD COLUMN "quality_score" numeric(4, 2);
ALTER TABLE "prism_summaries" ADD COLUMN "demoted" boolean DEFAULT false NOT NULL;
