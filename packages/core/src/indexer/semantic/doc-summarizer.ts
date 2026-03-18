/**
 * Documentation chunking and summarisation.
 *
 * Splits markdown documentation by H2 headings into digestible chunks,
 * then summarises each chunk using Claude Haiku. Large sections are
 * further split at H3 boundaries.
 */

import { createHash } from "node:crypto";
import { logger } from "../../logger.js";
import { createAnthropicClient } from "../../llm/client.js";
import type { BudgetTracker } from "../types.js";
import type { SemanticConfig } from "../../domain/types.js";
import type { SummaryResult } from "./summarizer.js";
import { estimateTokens } from "./chunker.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Cost per input token for Claude Haiku (approximate). */
const HAIKU_INPUT_COST_PER_TOKEN = 0.00000080; // $0.80 / 1M tokens
/** Cost per output token for Claude Haiku (approximate). */
const HAIKU_OUTPUT_COST_PER_TOKEN = 0.000004; // $4.00 / 1M tokens

/** Maximum chars before a section is split further at H3. ~3000 tokens. */
const MAX_SECTION_CHARS = 12000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A chunk of documentation content, split by headings. */
export interface DocChunk {
  /** Project-relative file path of the documentation file. */
  filePath: string;
  /** The heading for this chunk (H2 or H3 text). */
  heading: string;
  /** The raw markdown content of this chunk. */
  content: string;
  /** Full heading hierarchy, e.g. "Migration > Controller Migration". */
  headingPath: string;
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

/**
 * Split documentation content by headings into chunks.
 *
 * Primary split is at H2 (##) level. If a section exceeds ~3000 tokens
 * (estimated at 4 chars/token = 12000 chars), it is further split at
 * H3 (###) boundaries.
 */
export function chunkDocContent(filePath: string, docContent: string): DocChunk[] {
  const lines = docContent.split("\n");
  const chunks: DocChunk[] = [];

  let currentH2 = "";
  let currentH3 = "";
  let currentContent: string[] = [];

  function flushChunk(): void {
    if (currentContent.length === 0) return;

    const heading = currentH3 || currentH2 || "Introduction";
    const headingPath = currentH3 && currentH2
      ? `${currentH2} > ${currentH3}`
      : currentH2 || "Introduction";

    chunks.push({
      filePath,
      heading,
      content: currentContent.join("\n"),
      headingPath,
    });
  }

  for (const line of lines) {
    if (line.startsWith("## ") && !line.startsWith("### ")) {
      // Flush previous chunk
      flushChunk();

      currentH2 = line.replace(/^## /, "").trim();
      currentH3 = "";
      currentContent = [line];
    } else if (line.startsWith("### ")) {
      // Only split at H3 if current content is already large
      if (currentContent.join("\n").length > MAX_SECTION_CHARS) {
        flushChunk();
        currentH3 = line.replace(/^### /, "").trim();
        currentContent = [line];
      } else {
        currentContent.push(line);
      }
    } else {
      currentContent.push(line);
    }
  }

  // Don't forget the last chunk
  flushChunk();

  return chunks;
}

// ---------------------------------------------------------------------------
// Target ID
// ---------------------------------------------------------------------------

/**
 * Build the stable target ID for a doc summary.
 *
 * Format: "doc:<filePath>:<heading>"
 */
export function docTargetId(filePath: string, heading: string): string {
  return `doc:${filePath}:${heading}`;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const DOC_SUMMARY_PROMPT = `Summarize this documentation section. What topic does it cover? What guidance does it provide?

Be specific about the advice, conventions, or instructions given. Keep it to 2-4 sentences.

File: {{filePath}}
Section: {{heading}}

---

{{content}}`;

function buildDocPrompt(chunk: DocChunk): string {
  return DOC_SUMMARY_PROMPT
    .replace(/\{\{filePath\}\}/g, chunk.filePath)
    .replace(/\{\{heading\}\}/g, chunk.heading)
    .replace(/\{\{content\}\}/g, chunk.content);
}

function computeInputHash(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

function computeCost(inputTokens: number, outputTokens: number): number {
  return (
    inputTokens * HAIKU_INPUT_COST_PER_TOKEN +
    outputTokens * HAIKU_OUTPUT_COST_PER_TOKEN
  );
}

// ---------------------------------------------------------------------------
// Summariser
// ---------------------------------------------------------------------------

/**
 * Summarise doc chunks using Claude Haiku.
 *
 * Processes chunks sequentially (to respect rate limits), tracks spending
 * via the BudgetTracker, and skips chunks whose prompt hash hasn't changed.
 *
 * @param chunks         - documentation chunks to summarise
 * @param config         - semantic configuration
 * @param budget         - budget tracker
 * @param existingHashes - set of input_hash values already in the DB
 * @returns array of summary results (only new/changed ones)
 */
export async function summariseDocChunks(
  chunks: DocChunk[],
  config: SemanticConfig,
  budget: BudgetTracker,
  existingHashes: Set<string> = new Set(),
): Promise<SummaryResult[]> {
  const client = createAnthropicClient();
  const results: SummaryResult[] = [];

  for (const chunk of chunks) {
    if (budget.exceeded) {
      logger.warn(
        { remaining: budget.remaining, spent: budget.spentUsd },
        "Budget exceeded - stopping doc summarisation",
      );
      break;
    }

    // Skip very short chunks (not worth summarising)
    if (chunk.content.trim().length < 50) {
      logger.debug(
        { heading: chunk.heading, filePath: chunk.filePath },
        "Skipping tiny doc chunk",
      );
      continue;
    }

    const prompt = buildDocPrompt(chunk);
    const inputHash = computeInputHash(prompt);

    if (existingHashes.has(inputHash)) {
      logger.debug(
        { heading: chunk.heading, filePath: chunk.filePath },
        "Skipping doc chunk - summary unchanged",
      );
      continue;
    }

    try {
      const response = await client.messages.create({
        model: config.model,
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      });

      const textBlock = response.content.find((block: { type: string }) => block.type === "text");
      const content = textBlock && "text" in textBlock ? textBlock.text : "";

      const costUsd = computeCost(
        response.usage.input_tokens,
        response.usage.output_tokens,
      );

      budget.record(costUsd);

      const targetId = docTargetId(chunk.filePath, chunk.heading);

      results.push({
        symbolName: chunk.heading,
        symbolKind: "doc",
        content: content.trim(),
        inputHash,
        costUsd,
        model: config.model,
        targetId,
        qualityScore: 0.7, // docs are generally well-structured, default to decent
        demoted: false,
      });

      logger.info(
        {
          heading: chunk.heading,
          filePath: chunk.filePath,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          costUsd: costUsd.toFixed(4),
        },
        "Doc chunk summarised",
      );
    } catch (err) {
      logger.error(
        {
          heading: chunk.heading,
          filePath: chunk.filePath,
          error: err instanceof Error ? err.message : String(err),
        },
        "Failed to summarise doc chunk",
      );
    }
  }

  return results;
}
