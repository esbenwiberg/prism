/**
 * Pluggable embedding provider for the semantic layer.
 *
 * Supports Voyage AI (voyage-code-3), OpenAI (text-embedding-3-small),
 * and Azure OpenAI (text-embedding-3-small via Azure AI Foundry).
 * A factory function selects the provider based on configuration.
 */

import { logger } from "../../logger.js";
import type { SemanticConfig } from "../../domain/types.js";
import { getApiKey } from "../../domain/config.js";

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

  constructor(model: string, apiKey?: string) {
    this.model = model;
    const key = apiKey || process.env.VOYAGE_API_KEY;
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

  constructor(model: string, apiKey?: string) {
    this.model = model;
    const key = apiKey || process.env.OPENAI_API_KEY;
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
// Azure OpenAI provider
// ---------------------------------------------------------------------------

interface AzureOpenAIEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
  usage?: { prompt_tokens?: number; total_tokens?: number };
}

/**
 * Azure OpenAI embedding provider.
 *
 * Calls the Azure AI Foundry REST API. Requires AZURE_OPENAI_API_KEY and
 * AZURE_OPENAI_ENDPOINT env vars.
 */
export class AzureOpenAIProvider implements EmbeddingProvider {
  readonly name = "azure-openai";
  readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;

  constructor(model: string, opts?: { apiKey?: string; endpoint?: string }) {
    this.model = model;
    const key = opts?.apiKey || process.env.AZURE_OPENAI_API_KEY;
    if (!key) {
      throw new Error("AZURE_OPENAI_API_KEY environment variable is required for Azure OpenAI embeddings");
    }
    const endpoint = opts?.endpoint || process.env.AZURE_OPENAI_ENDPOINT;
    if (!endpoint) {
      throw new Error("AZURE_OPENAI_ENDPOINT environment variable is required for Azure OpenAI embeddings");
    }
    this.apiKey = key;
    this.endpoint = endpoint.replace(/\/+$/, ""); // strip trailing slashes
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const url = `${this.endpoint}/openai/deployments/${this.model}/embeddings?api-version=2024-06-01`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": this.apiKey,
      },
      body: JSON.stringify({
        input: texts,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Azure OpenAI API error (${response.status}): ${body}`,
      );
    }

    const data = (await response.json()) as AzureOpenAIEmbeddingResponse;

    logger.debug(
      {
        provider: this.name,
        model: this.model,
        texts: texts.length,
        tokens: data.usage?.total_tokens,
      },
      "Azure OpenAI embeddings generated",
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
      return new VoyageProvider(
        config.embeddingModel,
        getApiKey("voyageApiKey", "VOYAGE_API_KEY"),
      );

    case "openai":
      return new OpenAIProvider(
        config.embeddingModel,
        getApiKey("openaiApiKey", "OPENAI_API_KEY"),
      );

    case "azure-openai":
      return new AzureOpenAIProvider(config.embeddingModel, {
        apiKey: getApiKey("azureOpenaiApiKey", "AZURE_OPENAI_API_KEY"),
        endpoint: getApiKey("azureOpenaiEndpoint", "AZURE_OPENAI_ENDPOINT"),
      });

    default:
      throw new Error(
        `Unknown embedding provider "${config.embeddingProvider}". Supported: voyage, openai, azure-openai.`,
      );
  }
}
