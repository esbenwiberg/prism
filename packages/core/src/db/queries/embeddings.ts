/**
 * Embedding CRUD and similarity search operations for prism_embeddings.
 *
 * All functions use the shared database connection from `getDb()`.
 * Similarity search uses pgvector's cosine distance operator (<=>).
 */

import { eq, sql } from "drizzle-orm";
import { getDb } from "../connection.js";
import { embeddings, summaries, symbols, files } from "../schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InsertEmbeddingInput {
  projectId: number;
  summaryId: number;
  /** 1536-dimension float vector. */
  embedding: number[];
  /** The model used to generate the embedding. */
  model: string | null;
}

export type EmbeddingRow = typeof embeddings.$inferSelect;

/** A search result from the similarity search. */
export interface SimilaritySearchResult {
  /** prism_embeddings.id */
  embeddingId: number;
  /** Cosine distance (lower = more similar). */
  distance: number;
  /** Relevance score (1 - distance, higher = more similar). */
  score: number;
  /** Summary content. */
  summaryContent: string;
  /** Summary target ID (e.g. "file:symbol:kind"). */
  targetId: string;
  /** Summary level. */
  level: string;
  /** File path (project-relative). */
  filePath: string | null;
  /** Symbol name. */
  symbolName: string | null;
  /** Symbol kind. */
  symbolKind: string | null;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Insert a single embedding.
 */
export async function insertEmbedding(
  input: InsertEmbeddingInput,
): Promise<EmbeddingRow> {
  const db = getDb();
  const [row] = await db
    .insert(embeddings)
    .values({
      projectId: input.projectId,
      summaryId: input.summaryId,
      embedding: input.embedding,
      model: input.model,
    })
    .returning();
  return row;
}

/**
 * Bulk insert embeddings.
 */
export async function bulkInsertEmbeddings(
  inputs: InsertEmbeddingInput[],
): Promise<EmbeddingRow[]> {
  if (inputs.length === 0) return [];
  const db = getDb();
  return db
    .insert(embeddings)
    .values(
      inputs.map((inp) => ({
        projectId: inp.projectId,
        summaryId: inp.summaryId,
        embedding: inp.embedding,
        model: inp.model,
      })),
    )
    .returning();
}

/**
 * Delete all embeddings for a project.
 */
export async function deleteEmbeddingsByProjectId(
  projectId: number,
): Promise<void> {
  const db = getDb();
  await db
    .delete(embeddings)
    .where(eq(embeddings.projectId, projectId));
}

/**
 * Perform a cosine similarity search using pgvector.
 *
 * Embeds the query vector, then uses the `<=>` operator to find the
 * nearest embeddings. Joins with summaries, symbols, and files tables
 * to return enriched results.
 *
 * @param projectId   — the project to search within
 * @param queryVector — the embedded query vector (1536 dimensions)
 * @param limit       — maximum number of results (default 10)
 * @returns array of SimilaritySearchResult, ordered by relevance (most similar first)
 */
export async function similaritySearch(
  projectId: number,
  queryVector: number[],
  limit: number = 10,
): Promise<SimilaritySearchResult[]> {
  const db = getDb();

  // Format the vector as a pgvector literal: [0.1,0.2,...]
  const vectorLiteral = `[${queryVector.join(",")}]`;

  const results = await db.execute(sql`
    SELECT
      e.id AS embedding_id,
      e.embedding <=> ${vectorLiteral}::vector AS distance,
      s.content AS summary_content,
      s.target_id,
      s.level,
      f.path AS file_path,
      sym.name AS symbol_name,
      sym.kind AS symbol_kind
    FROM prism_embeddings e
    JOIN prism_summaries s ON s.id = e.summary_id
    LEFT JOIN prism_symbols sym ON sym.project_id = s.project_id
      AND s.target_id = CONCAT(
        (SELECT path FROM prism_files WHERE id = sym.file_id),
        ':',
        sym.name,
        ':',
        sym.kind
      )
    LEFT JOIN prism_files f ON f.id = sym.file_id
    WHERE e.project_id = ${projectId}
    ORDER BY e.embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `);

  return (results.rows as Array<Record<string, unknown>>).map((row) => {
    const distance = Number(row.distance ?? 0);
    return {
      embeddingId: Number(row.embedding_id),
      distance,
      score: Math.max(0, 1 - distance),
      summaryContent: String(row.summary_content ?? ""),
      targetId: String(row.target_id ?? ""),
      level: String(row.level ?? ""),
      filePath: row.file_path ? String(row.file_path) : null,
      symbolName: row.symbol_name ? String(row.symbol_name) : null,
      symbolKind: row.symbol_kind ? String(row.symbol_kind) : null,
    };
  });
}

/**
 * Simple similarity search that only uses summaries (no symbol join).
 *
 * This is a simpler fallback that avoids the complex symbol join.
 * It parses the target_id to extract file path and symbol information.
 *
 * @param projectId   — the project to search within
 * @param queryVector — the embedded query vector (1536 dimensions)
 * @param limit       — maximum number of results (default 10)
 * @returns array of SimilaritySearchResult, ordered by relevance
 */
export async function simpleSimilaritySearch(
  projectId: number,
  queryVector: number[],
  limit: number = 10,
): Promise<SimilaritySearchResult[]> {
  const db = getDb();

  const vectorLiteral = `[${queryVector.join(",")}]`;

  const results = await db.execute(sql`
    SELECT
      e.id AS embedding_id,
      e.embedding <=> ${vectorLiteral}::vector AS distance,
      s.content AS summary_content,
      s.target_id,
      s.level
    FROM prism_embeddings e
    JOIN prism_summaries s ON s.id = e.summary_id
    WHERE e.project_id = ${projectId}
    ORDER BY e.embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `);

  return (results.rows as Array<Record<string, unknown>>).map((row) => {
    const distance = Number(row.distance ?? 0);
    const targetId = String(row.target_id ?? "");

    // Parse target_id: "filePath:symbolName:symbolKind"
    const parts = targetId.split(":");
    const filePath = parts.length >= 1 ? parts.slice(0, -2).join(":") : null;
    const symbolName = parts.length >= 2 ? parts[parts.length - 2] : null;
    const symbolKind = parts.length >= 3 ? parts[parts.length - 1] : null;

    return {
      embeddingId: Number(row.embedding_id),
      distance,
      score: Math.max(0, 1 - distance),
      summaryContent: String(row.summary_content ?? ""),
      targetId,
      level: String(row.level ?? ""),
      filePath,
      symbolName,
      symbolKind,
    };
  });
}
