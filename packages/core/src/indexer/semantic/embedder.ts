/**
 * Pluggable embedding provider for the semantic layer.
 *
 * Supports Voyage AI (voyage-code-3) and OpenAI (text-embedding-3-small).
 * A factory function selects the provider based on configuration.
 */

import { logger } from "../../logger.js";
import type { SemanticConfig } from "../../domain/types.js";

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/** Generic embedding provider. */
export interface EmbeddingProvider {
  /** Provider name for display/logging. */
  readonly name: string;
  /** Model identifier used for embedding. */
  readonly model: string;

  /**
   * Embed one or more texts, returning one vector per text.
   *
   * @param texts — array of strings to embed
   * @returns array of number arrays (one per input text)
   */
  embed(texts: string[]): Promise<number[][]>;
}

// ---------------------------------------------------------------------------
// Voyage AI provider
// ---------------------------------------------------------------------------

interface VoyageEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  usage?: { total_tokens?: number };
}

/**
 * Voyage AI embedding provider.
 *
 * Calls the Voyage AI REST API. Requires VOYAGE_API_KEY env var.
 */
export class VoyageProvider implements EmbeddingProvider {
  readonly name = "voyage";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.voyageai.com/v1";

  constructor(model: string) {
    this.model = model;
    const key = process.env.VOYAGE_API_KEY;
    if (!key) {
      throw new Error("VOYAGE_API_KEY environment variable is required for Voyage embeddings");
    }
    this.apiKey = key;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        input_type: "document",
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Voyage API error (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as VoyageEmbeddingResponse;

    logger.debug(
      {
        provider: this.name,
        model: this.model,
        texts: texts.length,
        tokens: data.usage?.total_tokens,
      },
      "Voyage embeddings generated",
    );

    return data.data.map((d) => d.embedding);
  }
}

// ---------------------------------------------------------------------------
// OpenAI provider
// ---------------------------------------------------------------------------

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

/**
 * OpenAI embedding provider.
 *
 * Calls the OpenAI REST API. Requires OPENAI_API_KEY env var.
 */
export class OpenAIProvider implements EmbeddingProvider {
  readonly name = "openai";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.openai.com/v1";

  constructor(model: string) {
    this.model = model;
    const key = process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error("OPENAI_API_KEY environment variable is required for OpenAI embeddings");
    }
    this.apiKey = key;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `OpenAI API error (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as OpenAIEmbeddingResponse;

    logger.debug(
      {
        provider: this.name,
        model: this.model,
        texts: texts.length,
        tokens: data.usage?.total_tokens,
      },
      "OpenAI embeddings generated",
    );

    return data.data.map((d) => d.embedding);
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create an embedding provider based on the semantic configuration.
 *
 * @param config — semantic configuration from prism.config.yaml
 * @returns an EmbeddingProvider instance
 */
export function createEmbedder(config: SemanticConfig): EmbeddingProvider {
  const provider = config.embeddingProvider.toLowerCase();

  switch (provider) {
    case "voyage":
      return new VoyageProvider(config.embeddingModel);

    case "openai":
      return new OpenAIProvider(config.embeddingModel);

    default:
      throw new Error(
        `Unknown embedding provider "${config.embeddingProvider}". Supported: voyage, openai.`,
      );
  }
}
