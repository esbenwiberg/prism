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
  /** Minimum similarity score (0-1) to include a vector result. Default: 0.35 */
  minScore?: number;
}

/**
 * Run semantic similarity search and return ranked signal items.
 *
 * After vector search, augments results with keyword-matched files:
 * - Files already in vector results get a relevance BOOST if their
 *   filename matches specific query terms
 * - Files NOT in vector results get added as new items
 *
 * Uses inverse-frequency filtering so generic terms like "service"
 * (matching 100+ files) are ignored while specific terms like
 * "delegation" (matching 2 files) surface with high confidence.
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
    minScore = 0.35,
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

  // Find keyword matches across ALL project files (including those already
  // in vector results — those get boosted, not skipped)
  const keywordData = await findKeywordMatches(projectId, query);

  // Build items from vector results, boosting those that also match keywords
  const items: SignalItem[] = results.map((r) => {
    let relevance = computeRelevance(r.score, r.filePath, options);

    // Boost vector results whose filename matches specific query terms
    if (r.filePath) {
      const kwMatch = keywordData.matchedPaths.get(r.filePath);
      if (kwMatch) {
        const boost = 0.3 + 0.1 * kwMatch.matchedWords.length;
        relevance = Math.min(1, relevance + boost);
      }
    }

    const label = r.filePath
      ? `**${r.filePath}**${r.symbolName ? ` — \`${r.symbolName}\`` : ""} (${r.level})`
      : `**${r.targetId}** (${r.level})`;
    const content = `${label}\n${r.summaryContent}`;
    return { content, relevance };
  });

  // Add keyword-only matches (files not in vector results)
  const existingPaths = new Set(
    results.map((r) => r.filePath).filter((p): p is string => p != null),
  );
  const newKeywordItems = await buildKeywordItems(
    projectId,
    keywordData,
    existingPaths,
    options,
  );
  items.push(...newKeywordItems);

  // Re-sort by relevance after merging and boosting
  items.sort((a, b) => b.relevance - a.relevance);

  return { heading, priority, items };
}

// ---------------------------------------------------------------------------
// Keyword matching
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

interface KeywordMatchData {
  /** path → { fileId, matchedWords } for ALL matching files (including vector results) */
  matchedPaths: Map<string, { fileId: number; matchedWords: string[] }>;
}

/**
 * Find all files whose filenames contain specific query terms.
 * Returns matches for ALL files — the caller decides which are new
 * vs. which should boost existing vector results.
 */
async function findKeywordMatches(
  projectId: number,
  query: string,
): Promise<KeywordMatchData> {
  const words = extractDiscriminatingWords(query);
  const matchedPaths = new Map<string, { fileId: number; matchedWords: string[] }>();

  if (words.length === 0) return { matchedPaths };

  const allFiles = await getProjectFiles(projectId);

  for (const word of words) {
    const wordLower = word.toLowerCase();
    const hits = allFiles.filter((f) => {
      const filename = f.path.split("/").pop()?.toLowerCase() ?? "";
      return filename.includes(wordLower);
    });

    // Specificity filter: skip words that match too many files
    if (hits.length === 0 || hits.length > MAX_PATH_HITS) continue;

    for (const file of hits) {
      const existing = matchedPaths.get(file.path);
      if (existing) {
        existing.matchedWords.push(word);
      } else {
        matchedPaths.set(file.path, { fileId: file.id, matchedWords: [word] });
      }
    }
  }

  return { matchedPaths };
}

/**
 * Build signal items for keyword matches that are NOT already in
 * vector results. Fetches summaries and symbols for context.
 */
async function buildKeywordItems(
  projectId: number,
  keywordData: KeywordMatchData,
  existingPaths: Set<string>,
  rankOptions: RankOptions,
): Promise<SignalItem[]> {
  const items: SignalItem[] = [];
  const newMatches = [...keywordData.matchedPaths.entries()].filter(
    ([path]) => !existingPaths.has(path),
  );

  if (newMatches.length === 0) return items;

  const fetches = newMatches.map(
    async ([path, { fileId, matchedWords }]) => {
      const summary = await getSummaryByTargetId(projectId, `file:${path}`);
      const symbols = await getExportedSymbolsByFileId(fileId);

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

      // High base relevance — filename match is strong signal
      const baseRelevance = Math.min(1, 0.7 + 0.1 * matchedWords.length);
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
