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
import Anthropic from "@anthropic-ai/sdk";

import { logger } from "../../logger.js";
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
  const client = new Anthropic();
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
      logger.debug(
        { symbol: input.symbol.name, filePath: input.filePath },
        "Skipping symbol — summary unchanged",
      );
      continue;
    }

    try {
      const response = await client.messages.create({
        model: config.model,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      });

      // Extract text from response
      const textBlock = response.content.find((block) => block.type === "text");
      const content = textBlock && "text" in textBlock ? textBlock.text : "";

      // Compute cost
      const costUsd = computeCost(
        response.usage.input_tokens,
        response.usage.output_tokens,
      );

      budget.record(costUsd);

      const targetId = `${input.filePath}:${input.symbol.name}:${input.symbol.kind}`;

      results.push({
        symbolName: input.symbol.name,
        symbolKind: input.symbol.kind,
        content,
        inputHash,
        costUsd,
        model: config.model,
        targetId,
      });

      logger.debug(
        {
          symbol: input.symbol.name,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          costUsd: costUsd.toFixed(4),
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
