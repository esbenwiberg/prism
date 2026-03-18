/**
 * Near-duplicate embedding detection.
 *
 * After embedding, checks for near-duplicate vectors (cosine similarity > 0.95)
 * within the same project. Flags them for review rather than auto-merging,
 * since different files can legitimately have similar summaries.
 */

import { logger } from "../../logger.js";

/** Minimum cosine similarity to flag as near-duplicate. */
const NEAR_DUPLICATE_THRESHOLD = 0.95;

export interface NearDuplicate {
  targetIdA: string;
  targetIdB: string;
  similarity: number;
}

/**
 * Detect near-duplicate embeddings from a batch of newly created vectors.
 *
 * Computes pairwise cosine similarity within the batch and flags pairs
 * exceeding the threshold. This is O(n²) but n is bounded by batch size
 * (typically 100), so it's cheap.
 *
 * @returns Array of near-duplicate pairs for monitoring/dashboard display.
 */
export function detectNearDuplicates(
  items: Array<{ targetId: string; embedding: number[] }>,
): NearDuplicate[] {
  const duplicates: NearDuplicate[] = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const sim = cosineSimilarity(items[i].embedding, items[j].embedding);
      if (sim > NEAR_DUPLICATE_THRESHOLD) {
        duplicates.push({
          targetIdA: items[i].targetId,
          targetIdB: items[j].targetId,
          similarity: sim,
        });
      }
    }
  }

  if (duplicates.length > 0) {
    logger.warn(
      { count: duplicates.length, pairs: duplicates.slice(0, 5) },
      "Near-duplicate embeddings detected",
    );
  }

  return duplicates;
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}
