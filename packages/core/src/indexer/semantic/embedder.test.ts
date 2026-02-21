/**
 * Tests for the embedding provider factory and providers.
 *
 * API calls are mocked — these tests verify provider construction
 * and the factory function.
 */

import { describe, it, expect } from "vitest";
import {
  createEmbedder,
  VoyageProvider,
  OpenAIProvider,
} from "./embedder.js";
import type { SemanticConfig } from "../../domain/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<SemanticConfig> = {}): SemanticConfig {
  return {
    enabled: true,
    model: "claude-haiku-4-5-20251001",
    embeddingProvider: "voyage",
    embeddingModel: "voyage-code-3",
    embeddingDimensions: 1536,
    budgetUsd: 10.0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createEmbedder (factory)
// ---------------------------------------------------------------------------

describe("createEmbedder", () => {
  it("creates a VoyageProvider when provider is 'voyage'", () => {
    // Set the env var so the constructor doesn't throw
    const originalKey = process.env.VOYAGE_API_KEY;
    process.env.VOYAGE_API_KEY = "test-key";
    try {
      const embedder = createEmbedder(makeConfig({ embeddingProvider: "voyage" }));
      expect(embedder).toBeInstanceOf(VoyageProvider);
      expect(embedder.name).toBe("voyage");
      expect(embedder.model).toBe("voyage-code-3");
    } finally {
      if (originalKey === undefined) {
        delete process.env.VOYAGE_API_KEY;
      } else {
        process.env.VOYAGE_API_KEY = originalKey;
      }
    }
  });

  it("creates an OpenAIProvider when provider is 'openai'", () => {
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    try {
      const embedder = createEmbedder(
        makeConfig({
          embeddingProvider: "openai",
          embeddingModel: "text-embedding-3-small",
        }),
      );
      expect(embedder).toBeInstanceOf(OpenAIProvider);
      expect(embedder.name).toBe("openai");
      expect(embedder.model).toBe("text-embedding-3-small");
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });

  it("is case-insensitive for provider name", () => {
    const originalKey = process.env.VOYAGE_API_KEY;
    process.env.VOYAGE_API_KEY = "test-key";
    try {
      const embedder = createEmbedder(makeConfig({ embeddingProvider: "Voyage" }));
      expect(embedder).toBeInstanceOf(VoyageProvider);
    } finally {
      if (originalKey === undefined) {
        delete process.env.VOYAGE_API_KEY;
      } else {
        process.env.VOYAGE_API_KEY = originalKey;
      }
    }
  });

  it("throws for an unknown provider", () => {
    expect(() =>
      createEmbedder(makeConfig({ embeddingProvider: "unknown" })),
    ).toThrow("Unknown embedding provider");
  });
});

// ---------------------------------------------------------------------------
// VoyageProvider
// ---------------------------------------------------------------------------

describe("VoyageProvider", () => {
  it("throws if VOYAGE_API_KEY is not set", () => {
    const originalKey = process.env.VOYAGE_API_KEY;
    delete process.env.VOYAGE_API_KEY;
    try {
      expect(() => new VoyageProvider("voyage-code-3")).toThrow(
        "VOYAGE_API_KEY",
      );
    } finally {
      if (originalKey !== undefined) {
        process.env.VOYAGE_API_KEY = originalKey;
      }
    }
  });

  it("has correct name and model", () => {
    const originalKey = process.env.VOYAGE_API_KEY;
    process.env.VOYAGE_API_KEY = "test-key";
    try {
      const provider = new VoyageProvider("voyage-code-3");
      expect(provider.name).toBe("voyage");
      expect(provider.model).toBe("voyage-code-3");
    } finally {
      if (originalKey === undefined) {
        delete process.env.VOYAGE_API_KEY;
      } else {
        process.env.VOYAGE_API_KEY = originalKey;
      }
    }
  });

  it("returns empty array for empty input", async () => {
    const originalKey = process.env.VOYAGE_API_KEY;
    process.env.VOYAGE_API_KEY = "test-key";
    try {
      const provider = new VoyageProvider("voyage-code-3");
      const result = await provider.embed([]);
      expect(result).toEqual([]);
    } finally {
      if (originalKey === undefined) {
        delete process.env.VOYAGE_API_KEY;
      } else {
        process.env.VOYAGE_API_KEY = originalKey;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// OpenAIProvider
// ---------------------------------------------------------------------------

describe("OpenAIProvider", () => {
  it("throws if OPENAI_API_KEY is not set", () => {
    const originalKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
      expect(() => new OpenAIProvider("text-embedding-3-small")).toThrow(
        "OPENAI_API_KEY",
      );
    } finally {
      if (originalKey !== undefined) {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });

  it("has correct name and model", () => {
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    try {
      const provider = new OpenAIProvider("text-embedding-3-small");
      expect(provider.name).toBe("openai");
      expect(provider.model).toBe("text-embedding-3-small");
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });

  it("returns empty array for empty input", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    try {
      const provider = new OpenAIProvider("text-embedding-3-small");
      const result = await provider.embed([]);
      expect(result).toEqual([]);
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = originalKey;
      }
    }
  });
});
