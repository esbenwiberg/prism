/**
 * AST-aware chunking for large files.
 *
 * Splits source code into semantic chunks by function/class boundaries
 * for summarisation. Respects token limits so each chunk can be sent
 * to the LLM without truncation.
 */

import { logger } from "../../logger.js";
import type { ExtractedSymbol } from "../types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Rough estimate: 1 token ~= 4 characters for English/code.
 * Used to approximate token counts without a real tokeniser.
 */
const CHARS_PER_TOKEN = 4;

/** Default maximum tokens per chunk (leaves room for the prompt wrapper). */
const DEFAULT_MAX_CHUNK_TOKENS = 3000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A chunk of source code associated with one or more symbols. */
export interface SourceChunk {
  /** The symbol this chunk represents (if single-symbol chunk). */
  symbolName: string;
  /** The kind of symbol (function, class, etc.). */
  symbolKind: string;
  /** The source code for this chunk. */
  sourceCode: string;
  /** Start line in the original file (1-based). */
  startLine: number;
  /** End line in the original file (1-based). */
  endLine: number;
  /** Estimated token count. */
  estimatedTokens: number;
}

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/**
 * Estimate the number of tokens in a string.
 *
 * Uses a simple character-based heuristic (1 token ~= 4 chars).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Extract the source code for a single symbol from the file content.
 */
export function extractSymbolSource(
  fileContent: string,
  symbol: ExtractedSymbol,
): string {
  const lines = fileContent.split("\n");
  const start = Math.max(0, (symbol.startLine ?? 1) - 1);
  const end = Math.min(lines.length, symbol.endLine ?? lines.length);
  return lines.slice(start, end).join("\n");
}

/**
 * Build surrounding context for a symbol (other declarations in the same file).
 *
 * Returns the signatures/first lines of other exported symbols in the file,
 * trimmed to fit within a token budget.
 */
export function buildFileContext(
  fileContent: string,
  symbols: ExtractedSymbol[],
  currentSymbol: ExtractedSymbol,
  maxTokens: number = 500,
): string {
  const contextParts: string[] = [];
  let tokenCount = 0;

  for (const sym of symbols) {
    if (sym === currentSymbol) continue;
    if (!sym.exported) continue;

    const line = sym.signature ?? `${sym.kind} ${sym.name}`;
    const tokens = estimateTokens(line);

    if (tokenCount + tokens > maxTokens) break;

    contextParts.push(line);
    tokenCount += tokens;
  }

  return contextParts.join("\n");
}

/**
 * Chunk a file's symbols into processable pieces.
 *
 * Each symbol becomes its own chunk. If a symbol's source exceeds the
 * token limit, it is truncated with a marker.
 *
 * Only "function", "class", and "interface" symbols are included —
 * imports, exports, and type aliases are skipped as they are typically
 * not worth summarising individually.
 *
 * @param fileContent   — the full file source code
 * @param symbols       — extracted symbols from the structural layer
 * @param maxChunkTokens — maximum tokens per chunk (default 3000)
 * @returns array of SourceChunks, one per eligible symbol
 */
export function chunkFileSymbols(
  fileContent: string,
  symbols: ExtractedSymbol[],
  maxChunkTokens: number = DEFAULT_MAX_CHUNK_TOKENS,
): SourceChunk[] {
  const SUMMARISABLE_KINDS = new Set(["function", "class", "interface", "enum"]);
  const chunks: SourceChunk[] = [];

  const eligible = symbols.filter((s) => SUMMARISABLE_KINDS.has(s.kind));

  for (const symbol of eligible) {
    let sourceCode = extractSymbolSource(fileContent, symbol);
    let estimatedTok = estimateTokens(sourceCode);

    // Truncate if necessary
    if (estimatedTok > maxChunkTokens) {
      const maxChars = maxChunkTokens * CHARS_PER_TOKEN;
      sourceCode = sourceCode.slice(0, maxChars) + "\n// ... [truncated]";
      estimatedTok = maxChunkTokens;
      logger.debug(
        { symbol: symbol.name, originalTokens: estimateTokens(sourceCode) },
        "Symbol source truncated to fit token limit",
      );
    }

    chunks.push({
      symbolName: symbol.name,
      symbolKind: symbol.kind,
      sourceCode,
      startLine: symbol.startLine ?? 1,
      endLine: symbol.endLine ?? 1,
      estimatedTokens: estimatedTok,
    });
  }

  return chunks;
}

/**
 * Filter symbols that are worth summarising.
 *
 * Returns only functions, classes, and interfaces (not imports/exports/types).
 */
export function filterSummarisableSymbols(
  symbols: ExtractedSymbol[],
): ExtractedSymbol[] {
  const SUMMARISABLE_KINDS = new Set(["function", "class", "interface", "enum"]);
  return symbols.filter((s) => SUMMARISABLE_KINDS.has(s.kind));
}
