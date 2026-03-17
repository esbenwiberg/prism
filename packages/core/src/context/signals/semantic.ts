/**
 * Semantic signal collector.
 *
 * Wraps similaritySearch with query embedding to find relevant
 * code and summaries by semantic similarity, augmented with
 * keyword-based file path matching for high-specificity terms.
 */

import {
  similaritySearch,
  simpleSimilaritySearch,
  type SimilaritySearchResult,
} from "../../db/queries/embeddings.js";
import { getProjectFiles } from "../../db/queries/files.js";
import { getSummaryByTargetId } from "../../db/queries/summaries.js";
import { getExportedSymbolsByFileId } from "../../db/queries/symbols.js";
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
  /** Minimum similarity score (0-1) to include a vector result. Default: 0.25 */
  minScore?: number;
}

/**
 * Run semantic similarity search and return ranked signal items.
 *
 * After vector search, augments results with keyword-matched files
 * whose paths contain highly specific query terms (terms that match
 * only a few files). This ensures files like "StartDelegation.cs"
 * surface when the query mentions "delegation", without flooding
 * results for generic terms like "service" or "resource".
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
    minScore = 0.25,
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

  // Filter out low-similarity results — prevents irrelevant files from
  // diluting the signal when the vector search can't find good matches
  results = results.filter((r) => r.score >= minScore);

  const items: SignalItem[] = results.map((r) => {
    const relevance = computeRelevance(r.score, r.filePath, options);
    const label = r.filePath
      ? `**${r.filePath}**${r.symbolName ? ` — \`${r.symbolName}\`` : ""} (${r.level})`
      : `**${r.targetId}** (${r.level})`;
    const content = `${label}\n${r.summaryContent}`;
    return { content, relevance };
  });

  // Augment with keyword-matched files that the vector search missed
  const keywordItems = await collectKeywordMatches(
    projectId,
    query,
    results,
    options,
  );
  items.push(...keywordItems);

  // Re-sort by relevance after merging
  items.sort((a, b) => b.relevance - a.relevance);

  return { heading, priority, items };
}

// ---------------------------------------------------------------------------
// Keyword augmentation
// ---------------------------------------------------------------------------

/** Words too common to be useful for file path matching. */
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "as", "into", "through", "during",
  "before", "after", "above", "below", "between", "out", "off", "over",
  "under", "again", "further", "then", "once", "and", "but", "or", "nor",
  "not", "no", "so", "if", "it", "its", "this", "that", "these", "those",
  "we", "they", "i", "you", "he", "she", "my", "your", "his", "her",
  "our", "their", "what", "which", "who", "when", "where", "why", "how",
  "all", "each", "every", "both", "few", "more", "most", "other", "some",
  "such", "than", "too", "very", "just", "also", "new", "old", "use",
  "add", "make", "get", "set", "check", "want", "need", "still", "able",
  "however", "might",
]);

/** Minimum word length to consider for path matching. */
const MIN_WORD_LENGTH = 4;

/**
 * Maximum number of file path matches for a word to be considered
 * "specific enough". Words matching more files than this are discarded.
 */
const MAX_PATH_HITS = 15;

/**
 * Find files whose paths contain specific query terms that the vector
 * search missed. Uses inverse-frequency filtering: only terms matching
 * a small number of files are considered.
 */
async function collectKeywordMatches(
  projectId: number,
  query: string,
  existingResults: SimilaritySearchResult[],
  rankOptions: RankOptions,
): Promise<SignalItem[]> {
  // Extract candidate words from the query
  const words = extractDiscriminatingWords(query);
  if (words.length === 0) return [];

  const allFiles = await getProjectFiles(projectId);

  // Already-found file paths from vector search
  const existingPaths = new Set(
    existingResults
      .map((r) => r.filePath)
      .filter((p): p is string => p != null),
  );

  // For each word, find matching file paths and check specificity
  const matchedFileIds = new Map<number, { path: string; matchedWords: string[] }>();

  for (const word of words) {
    const wordLower = word.toLowerCase();
    const hits = allFiles.filter((f) => {
      // Match against the filename (last path segment), not the full path.
      // This avoids matching directory names like "services/" for the word "service".
      const filename = f.path.split("/").pop()?.toLowerCase() ?? "";
      return filename.includes(wordLower);
    });

    // Specificity filter: skip words that match too many files
    if (hits.length === 0 || hits.length > MAX_PATH_HITS) continue;

    for (const file of hits) {
      if (existingPaths.has(file.path)) continue; // Already in vector results

      const existing = matchedFileIds.get(file.id);
      if (existing) {
        existing.matchedWords.push(word);
      } else {
        matchedFileIds.set(file.id, { path: file.path, matchedWords: [word] });
      }
    }
  }

  if (matchedFileIds.size === 0) return [];

  // Fetch summaries and symbols for matched files, build signal items
  const items: SignalItem[] = [];

  const fetches = [...matchedFileIds.entries()].map(
    async ([fileId, { path, matchedWords }]) => {
      // Try to get a file-level summary
      const summary = await getSummaryByTargetId(projectId, `file:${path}`);
      const symbols = await getExportedSymbolsByFileId(fileId);

      // Build a label similar to vector search results
      const topSymbol = symbols[0];
      const label = topSymbol
        ? `**${path}** — \`${topSymbol.name}\` (${topSymbol.kind})`
        : `**${path}**`;
      const summaryText = summary
        ? summary.content.slice(0, 200)
        : symbols.length > 0
          ? `Exports: ${symbols.slice(0, 5).map((s) => s.name).join(", ")}`
          : "";

      const content = summaryText
        ? `${label}\n${summaryText}`
        : label;

      // Score: more matched words = higher relevance
      const baseRelevance = Math.min(1, 0.6 + 0.15 * matchedWords.length);
      const relevance = computeRelevance(baseRelevance, path, rankOptions);

      items.push({ content, relevance });
    },
  );

  await Promise.all(fetches);
  return items;
}

/**
 * Extract words from a query that are likely to be discriminating
 * file path terms. Filters out stop words, short words, and
 * pure numbers.
 */
function extractDiscriminatingWords(query: string): string[] {
  return query
    .split(/[\s,;:!?.()[\]{}"'`]+/)
    .map((w) => w.replace(/[^a-zA-Z0-9]/g, ""))
    .filter(
      (w) =>
        w.length >= MIN_WORD_LENGTH &&
        !STOP_WORDS.has(w.toLowerCase()) &&
        !/^\d+$/.test(w),
    );
}
