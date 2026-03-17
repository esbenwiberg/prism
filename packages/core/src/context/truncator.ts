/**
 * Token-budget-aware truncation.
 *
 * Uses a chars/4 heuristic to estimate tokens.
 */

import type { ContextSection, ContextResponse, SignalResult } from "./types.js";

/** Estimate token count from a string using chars/4 heuristic. */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Allocate token budget across sections by priority.
 *
 * Priority 1 sections get their full content first.
 * Remaining budget is split across lower-priority sections proportionally.
 */
export function truncateSections(
  sections: ContextSection[],
  maxTokens: number,
): ContextResponse {
  if (sections.length === 0) {
    return { sections: [], totalTokens: 0, truncated: false };
  }

  // Sort by priority (1 = highest)
  const sorted = [...sections].sort((a, b) => a.priority - b.priority);

  let remaining = maxTokens;
  let truncated = false;
  const result: ContextSection[] = [];

  for (const section of sorted) {
    if (remaining <= 0) {
      truncated = true;
      break;
    }

    if (section.tokenCount <= remaining) {
      result.push(section);
      remaining -= section.tokenCount;
    } else {
      // Truncate content to fit remaining budget
      const maxChars = remaining * 4;
      const truncatedContent = section.content.slice(0, maxChars);
      const truncatedTokens = estimateTokenCount(truncatedContent);
      result.push({
        ...section,
        content: truncatedContent + "\n\n*(truncated)*",
        tokenCount: truncatedTokens,
      });
      remaining -= truncatedTokens;
      truncated = true;
    }
  }

  const totalTokens = result.reduce((sum, s) => sum + s.tokenCount, 0);
  return { sections: result, totalTokens, truncated };
}

/**
 * Convert signal results to context sections, sorting items by relevance
 * within each section.
 */
export function signalsToSections(signals: SignalResult[]): ContextSection[] {
  return signals
    .filter((s) => s.items.length > 0)
    .map((signal) => {
      const sortedItems = [...signal.items].sort(
        (a, b) => b.relevance - a.relevance,
      );
      const content = sortedItems.map((i) => i.content).join("\n\n");
      return {
        heading: signal.heading,
        priority: signal.priority,
        content,
        tokenCount: estimateTokenCount(content),
      };
    });
}
