-- Widen embedding column from 1536 to 3072 dimensions (text-embedding-3-large).
-- Existing embeddings are incompatible and must be re-indexed.
DROP INDEX IF EXISTS "prism_embeddings_hnsw_idx";--> statement-breakpoint
TRUNCATE TABLE "prism_embeddings";--> statement-breakpoint
ALTER TABLE "prism_embeddings" ALTER COLUMN "embedding" SET DATA TYPE vector(3072);--> statement-breakpoint
CREATE INDEX "prism_embeddings_hnsw_idx" ON "prism_embeddings" USING hnsw ("embedding" vector_cosine_ops);
