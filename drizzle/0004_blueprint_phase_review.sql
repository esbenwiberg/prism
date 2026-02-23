-- Add AI phase review fields: decisions on milestones, notes/status/chat_history on phases.
ALTER TABLE "prism_blueprint_milestones" ADD COLUMN IF NOT EXISTS "decisions" jsonb DEFAULT '[]';--> statement-breakpoint
ALTER TABLE "prism_blueprint_phases" ADD COLUMN IF NOT EXISTS "notes" text;--> statement-breakpoint
ALTER TABLE "prism_blueprint_phases" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE "prism_blueprint_phases" ADD COLUMN IF NOT EXISTS "chat_history" jsonb NOT NULL DEFAULT '[]';
