/**
 * LLM summariser for code symbols.
 *
 * Uses the Anthropic SDK to call Claude Haiku and generate natural-language
 * summaries for functions, classes, and interfaces. Supports budget tracking
 * and input-hash-based staleness detection.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "../../logger.js";
import { createAnthropicClient } from "../../llm/client.js";
import type { BudgetTracker, ExtractedSymbol } from "../types.js";
import type { SemanticConfig } from "../../domain/types.js";
import { extractSymbolSource, buildFileContext, estimateTokens } from "./chunker.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cost per input token for Claude Haiku (approximate). */
const HAIKU_INPUT_COST_PER_TOKEN = 0.00000080; // $0.80 / 1M tokens
/** Cost per output token for Claude Haiku (approximate). */
const HAIKU_OUTPUT_COST_PER_TOKEN = 0.000004; // $4.00 / 1M tokens

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Input for summarising a single symbol. */
export interface SummariseInput {
  /** Project-relative file path. */
  filePath: string;
  /** The detected language of the file. */
  language: string;
  /** Full file content (for extracting context). */
  fileContent: string;
  /** The symbol to summarise. */
  symbol: ExtractedSymbol;
  /** All symbols in the same file (for context). */
  allSymbols: ExtractedSymbol[];
}

/** Result of summarising a single symbol. */
export interface SummaryResult {
  /** The symbol name. */
  symbolName: string;
  /** The symbol kind. */
  symbolKind: string;
  /** The generated summary text. */
  content: string;
  /** SHA-256 hash of the prompt input (for staleness detection). */
  inputHash: string;
  /** Cost in USD for this summary. */
  costUsd: number;
  /** The model used. */
  model: string;
  /** A stable target identifier (e.g. "file:symbol:kind"). */
  targetId: string;
  /** Self-assessed quality score 0.0-1.0 */
  qualityScore: number;
  /** Whether this summary was demoted due to low quality */
  demoted: boolean;
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

let _promptTemplate: string | undefined;

/**
 * Load the prompt template from prompts/summarize-function.md.
 *
 * Caches the result after first load.
 */
export function loadPromptTemplate(basePath?: string): string {
  if (_promptTemplate) return _promptTemplate;

  const promptPath = basePath
    ? resolve(basePath, "prompts/summarize-function.md")
    : resolve(process.cwd(), "prompts/summarize-function.md");

  try {
    _promptTemplate = readFileSync(promptPath, "utf-8");
  } catch {
    // Fallback: use an inline minimal prompt
    _promptTemplate = [
      "Summarise the following code symbol in 2-4 sentences.",
      "Describe what it does, its purpose, parameters, return values, and side effects.",
      "",
      "File: {{filePath}}",
      "Symbol: {{symbolName}} ({{symbolKind}})",
      "",
      "```{{language}}",
      "{{sourceCode}}",
      "```",
    ].join("\n");
    logger.warn({ promptPath }, "Prompt template not found, using inline fallback");
  }

  return _promptTemplate;
}

/**
 * Reset the cached prompt template (for testing).
 */
export function resetPromptTemplate(): void {
  _promptTemplate = undefined;
}

/**
 * Build the full prompt for a single symbol.
 *
 * Fills in the template placeholders with actual values.
 */
export function buildPrompt(input: SummariseInput, templateOverride?: string): string {
  const template = templateOverride ?? loadPromptTemplate();
  const sourceCode = extractSymbolSource(input.fileContent, input.symbol);
  const fileContext = buildFileContext(
    input.fileContent,
    input.allSymbols,
    input.symbol,
  );

  let prompt = template
    .replace(/\{\{filePath\}\}/g, input.filePath)
    .replace(/\{\{symbolName\}\}/g, input.symbol.name)
    .replace(/\{\{symbolKind\}\}/g, input.symbol.kind)
    .replace(/\{\{startLine\}\}/g, String(input.symbol.startLine ?? "?"))
    .replace(/\{\{endLine\}\}/g, String(input.symbol.endLine ?? "?"))
    .replace(/\{\{language\}\}/g, input.language)
    .replace(/\{\{sourceCode\}\}/g, sourceCode);

  // Handle conditional docstring block
  if (input.symbol.docstring) {
    prompt = prompt
      .replace(/\{\{#if docstring\}\}/g, "")
      .replace(/\{\{\/if\}\}/g, "")
      .replace(/\{\{docstring\}\}/g, input.symbol.docstring);
  } else {
    // Remove the entire conditional block
    prompt = prompt.replace(
      /\{\{#if docstring\}\}[\s\S]*?\{\{\/if\}\}/g,
      "",
    );
  }

  // Handle conditional file context block
  if (fileContext) {
    prompt = prompt
      .replace(/\{\{#if fileContext\}\}/g, "")
      .replace(/\{\{\/if\}\}/g, "")
      .replace(/\{\{fileContext\}\}/g, fileContext);
  } else {
    prompt = prompt.replace(
      /\{\{#if fileContext\}\}[\s\S]*?\{\{\/if\}\}/g,
      "",
    );
  }

  return prompt;
}

/**
 * Compute the SHA-256 hash of a prompt string for staleness detection.
 */
export function computeInputHash(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

/**
 * Compute cost in USD from token usage.
 */
export function computeCost(inputTokens: number, outputTokens: number): number {
  return (
    inputTokens * HAIKU_INPUT_COST_PER_TOKEN +
    outputTokens * HAIKU_OUTPUT_COST_PER_TOKEN
  );
}

// ---------------------------------------------------------------------------
// Quality scoring helpers
// ---------------------------------------------------------------------------

/**
 * Parse the CONFIDENCE score from LLM output and strip it from the summary.
 */
export function parseQualityScore(text: string): { summary: string; score: number } {
  const match = text.match(/CONFIDENCE:\s*([\d.]+)/);
  const score = match ? Math.min(1, Math.max(0, parseFloat(match[1]))) : 0.5;
  const summary = text.replace(/\n?CONFIDENCE:\s*[\d.]+\s*$/, "").trim();
  return { summary, score };
}

/**
 * Apply heuristic quality adjustments based on content analysis.
 */
export function applyHeuristicChecks(
  content: string,
  symbol: ExtractedSymbol,
  baseScore: number,
): number {
  let score = baseScore;
  const lineSpan = (symbol.endLine ?? 0) - (symbol.startLine ?? 0);

  // Too short for a large symbol
  if (content.length < 20 && lineSpan > 50) {
    score = Math.min(score, 0.3);
  }

  // Too generic / vague
  const vaguePatterns = [
    /this (?:function|method|class) (?:does|handles|performs) (?:things|logic|operations|work|stuff)/i,
    /^(?:a |the )?(?:function|method|class|helper|utility)\s*$/i,
  ];
  if (vaguePatterns.some((p) => p.test(content))) {
    score = Math.min(score, 0.3);
  }

  // Missing key terms from symbol name
  const nameTerms = symbol.name.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  const importantTerms = nameTerms.filter((t) =>
    [
      "auth",
      "cache",
      "valid",
      "encrypt",
      "decrypt",
      "parse",
      "format",
      "connect",
      "query",
      "fetch",
      "send",
      "receive",
    ].some((k) => t.includes(k)),
  );
  if (importantTerms.length > 0) {
    const contentLower = content.toLowerCase();
    const missingAll = importantTerms.every((t) => !contentLower.includes(t));
    if (missingAll) score = Math.max(0, score - 0.2);
  }

  return score;
}

/**
 * Build an enhanced prompt with neighbor context for retry attempts.
 */
export function buildEnhancedPrompt(input: SummariseInput, originalPrompt: string): string {
  const neighborContext = input.allSymbols
    .filter((s) => s.name !== input.symbol.name)
    .slice(0, 5)
    .map((s) => `  - ${s.name} (${s.kind}): ${s.signature ?? "no signature"}`)
    .join("\n");

  return (
    originalPrompt +
    `\n\nAdditional context — neighboring symbols in the same file:\n${neighborContext}\n\nPlease provide a more specific and accurate summary.`
  );
}

/** Confidence prompt suffix appended to every summarisation request. */
const CONFIDENCE_SUFFIX =
  "\n\nAfter your summary, on a new line write CONFIDENCE: followed by a number from 0.0 to 1.0 rating how confident you are that this summary accurately captures the symbol's purpose.";

// ---------------------------------------------------------------------------
// Summariser
// ---------------------------------------------------------------------------

/**
 * Summarise a batch of symbols using Claude Haiku.
 *
 * Processes symbols sequentially (to respect rate limits), tracks spending
 * via the BudgetTracker, and skips symbols whose prompt hash hasn't changed.
 *
 * @param inputs         — symbols to summarise
 * @param config         — semantic configuration
 * @param budget         — budget tracker
 * @param existingHashes — set of input_hash values already in the DB
 * @returns array of summary results (only new/changed ones)
 */
export async function summariseBatch(
  inputs: SummariseInput[],
  config: SemanticConfig,
  budget: BudgetTracker,
  existingHashes: Set<string> = new Set(),
): Promise<SummaryResult[]> {
  const client = createAnthropicClient();
  const results: SummaryResult[] = [];

  for (const input of inputs) {
    // Check budget
    if (budget.exceeded) {
      logger.warn(
        { remaining: budget.remaining, spent: budget.spentUsd },
        "Budget exceeded — stopping summarisation",
      );
      break;
    }

    const prompt = buildPrompt(input);
    const inputHash = computeInputHash(prompt);

    // Skip if we already have a summary with the same hash
    if (existingHashes.has(inputHash)) {
      logger.info(
        { symbol: input.symbol.name, filePath: input.filePath },
        "Skipping symbol — summary unchanged",
      );
      continue;
    }

    try {
      const promptWithConfidence = prompt + CONFIDENCE_SUFFIX;

      const response = await client.messages.create({
        model: config.model,
        max_tokens: 300,
        messages: [{ role: "user", content: promptWithConfidence }],
      });

      // Extract text from response
      const textBlock = response.content.find((block) => block.type === "text");
      const rawContent = textBlock && "text" in textBlock ? textBlock.text : "";

      // Compute cost
      let totalCostUsd = computeCost(
        response.usage.input_tokens,
        response.usage.output_tokens,
      );

      budget.record(totalCostUsd);

      // Parse quality score from response
      let { summary: cleanContent, score } = parseQualityScore(rawContent);

      // Retry once with enhanced prompt if score is too low
      if (score < 0.4 && !budget.exceeded) {
        logger.info(
          { symbol: input.symbol.name, score },
          "Low confidence — retrying with enhanced prompt",
        );

        const enhancedPrompt = buildEnhancedPrompt(input, prompt) + CONFIDENCE_SUFFIX;

        const retryResponse = await client.messages.create({
          model: config.model,
          max_tokens: 300,
          messages: [{ role: "user", content: enhancedPrompt }],
        });

        const retryTextBlock = retryResponse.content.find((block) => block.type === "text");
        const retryRawContent = retryTextBlock && "text" in retryTextBlock ? retryTextBlock.text : "";

        const retryCost = computeCost(
          retryResponse.usage.input_tokens,
          retryResponse.usage.output_tokens,
        );

        budget.record(retryCost);
        totalCostUsd += retryCost;

        const retryParsed = parseQualityScore(retryRawContent);
        cleanContent = retryParsed.summary;
        score = retryParsed.score;
      }

      // Apply heuristic adjustments
      const adjustedScore = applyHeuristicChecks(cleanContent, input.symbol, score);
      const demoted = adjustedScore < 0.4;

      const targetId = `${input.filePath}:${input.symbol.name}:${input.symbol.kind}`;

      results.push({
        symbolName: input.symbol.name,
        symbolKind: input.symbol.kind,
        content: cleanContent,
        inputHash,
        costUsd: totalCostUsd,
        model: config.model,
        targetId,
        qualityScore: adjustedScore,
        demoted,
      });

      logger.info(
        {
          symbol: input.symbol.name,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          costUsd: totalCostUsd.toFixed(4),
          qualityScore: adjustedScore.toFixed(2),
          demoted,
        },
        "Symbol summarised",
      );
    } catch (err) {
      logger.error(
        {
          symbol: input.symbol.name,
          error: err instanceof Error ? err.message : String(err),
        },
        "Failed to summarise symbol",
      );
      // Continue with the next symbol rather than failing the whole batch
    }
  }

  return results;
}
