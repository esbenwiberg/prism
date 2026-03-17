/**
 * Semantic signal collector.
 *
 * Wraps similaritySearch with query embedding to find relevant
 * code and summaries by semantic similarity.
 */

import {
  similaritySearch,
  simpleSimilaritySearch,
  type SimilaritySearchResult,
} from "../../db/queries/embeddings.js";
import { createEmbedder } from "../../indexer/semantic/embedder.js";
import { getConfig } from "../../domain/config.js";
import { computeRelevance, type RankOptions } from "../ranker.js";
import type { SignalResult, SignalItem } from "../types.js";

export interface SemanticSignalOptions extends RankOptions {
  projectId: number;
  query: string;
  limit?: number;
  heading?: string;
  priority?: number;
}

/**
 * Run semantic similarity search and return ranked signal items.
 */
export async function collectSemanticSignal(
  options: SemanticSignalOptions,
): Promise<SignalResult> {
  const {
    projectId,
    query,
    limit = 15,
    heading = "Semantically Related",
    priority = 4,
  } = options;

  const config = getConfig();
  const embedder = createEmbedder(config.semantic);
  const [queryVector] = await embedder.embed([query]);

  let results: SimilaritySearchResult[];
  try {
    results = await similaritySearch(projectId, queryVector, limit);
  } catch {
    results = await simpleSimilaritySearch(projectId, queryVector, limit);
  }

  const items: SignalItem[] = results.map((r) => {
    const relevance = computeRelevance(r.score, r.filePath, options);
    const label = r.filePath
      ? `**${r.filePath}**${r.symbolName ? ` — \`${r.symbolName}\`` : ""} (${r.level})`
      : `**${r.targetId}** (${r.level})`;
    const content = `${label}\n${r.summaryContent}`;
    return { content, relevance };
  });

  return { heading, priority, items };
}
