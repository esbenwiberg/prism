/**
 * Context enricher types.
 *
 * Used by the assembler, signal collectors, ranker, truncator, and formatter
 * to produce token-budget-aware context for AI agents.
 */

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export type ContextType = "file" | "module" | "related" | "architecture";

export interface ContextRequest {
  projectId: number;
  type: ContextType;
  /** File path, module path, or query depending on type. */
  target: string;
  /** Optional intent hint — boosts relevant signals. */
  intent?: string;
  /** Token budget for response (chars/4 heuristic). */
  maxTokens: number;
  /** Extra options passed to signal collectors. */
  options: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Section / Response types
// ---------------------------------------------------------------------------

export interface ContextSection {
  heading: string;
  /** 1 = must include, 5 = nice to have. */
  priority: number;
  content: string;
  tokenCount: number;
}

export interface ContextResponse {
  sections: ContextSection[];
  totalTokens: number;
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Signal types (internal, used by collectors)
// ---------------------------------------------------------------------------

export interface SignalResult {
  heading: string;
  priority: number;
  items: SignalItem[];
}

export interface SignalItem {
  content: string;
  relevance: number;
}
