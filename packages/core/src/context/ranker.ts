/**
 * Composite scoring for context signals.
 *
 * Combines semantic similarity, graph proximity, and summary granularity
 * into a single relevance score. Penalizes test files unless explicitly
 * requested.
 */

import type { SignalItem } from "./types.js";

export interface RankOptions {
  /** Boost items matching intent keywords. */
  intent?: string;
  /** Include test files at full weight. */
  includeTests?: boolean;
}

/**
 * Apply composite scoring to a signal item.
 *
 * @param base - base relevance from collector (0-1)
 * @param filePath - file path for test penalty
 * @param options - ranking options
 * @returns adjusted relevance score (0-1)
 */
export function computeRelevance(
  base: number,
  filePath: string | null,
  options: RankOptions = {},
): number {
  let score = base;

  // Penalize test files unless explicitly included
  if (!options.includeTests && filePath && isTestPath(filePath)) {
    score *= 0.3;
  }

  // Boost for intent match (simple keyword overlap)
  if (options.intent && filePath) {
    const intentWords = options.intent.toLowerCase().split(/\s+/);
    const pathLower = filePath.toLowerCase();
    const matches = intentWords.filter((w) => pathLower.includes(w)).length;
    if (matches > 0) {
      score *= 1 + 0.15 * matches;
    }
  }

  return Math.min(1, Math.max(0, score));
}

/**
 * Merge two ranked item lists, boosting items that appear in both.
 */
export function mergeRankedItems(
  listA: SignalItem[],
  listB: SignalItem[],
  weights: { a: number; b: number } = { a: 0.6, b: 0.4 },
  boostOverlap: number = 0.15,
): SignalItem[] {
  const map = new Map<string, { relevance: number; content: string }>();

  for (const item of listA) {
    const key = item.content.slice(0, 100);
    map.set(key, {
      relevance: item.relevance * weights.a,
      content: item.content,
    });
  }

  for (const item of listB) {
    const key = item.content.slice(0, 100);
    const existing = map.get(key);
    if (existing) {
      // Overlap boost
      existing.relevance += item.relevance * weights.b + boostOverlap;
    } else {
      map.set(key, {
        relevance: item.relevance * weights.b,
        content: item.content,
      });
    }
  }

  return [...map.values()]
    .sort((a, b) => b.relevance - a.relevance)
    .map((v) => ({ content: v.content, relevance: v.relevance }));
}

function isTestPath(path: string): boolean {
  return /\.(test|spec)\.|__tests__|\/test\/|\/tests\/|_test\.(py|go)$/.test(
    path,
  );
}
