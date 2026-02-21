# Milestone 7 Handoff: Layer 3 — Semantic (LLM Summaries + Embeddings)

## Summary

Milestone 7 implements the semantic indexing layer, which generates LLM descriptions for functions/classes, embeds them into vectors, and enables semantic search across a project's codebase.

## What Was Built

### Core Semantic Modules (`packages/core/src/indexer/semantic/`)

- **chunker.ts** — AST-aware chunking that splits files into per-symbol chunks for summarisation. Includes token estimation, symbol source extraction, file context building, and filtering for summarisable symbol kinds (function, class, interface, enum).

- **summarizer.ts** — Claude Haiku summariser using the `@anthropic-ai/sdk` package. Features include:
  - Prompt template loading from `prompts/summarize-function.md`
  - Template variable substitution with conditional blocks
  - SHA-256 input hash for staleness detection (skip unchanged symbols)
  - Cost computation from API token usage
  - Budget tracking integration
  - Batch processing with budget guard

- **embedder.ts** — Pluggable embedding provider with:
  - `EmbeddingProvider` interface with `embed(texts: string[]): Promise<number[][]>`
  - `VoyageProvider` — Voyage AI REST API integration
  - `OpenAIProvider` — OpenAI REST API integration
  - `createEmbedder(config)` factory function

### Prompt Template (`prompts/summarize-function.md`)

Structured prompt for function/class summarisation with placeholders for file path, symbol name/kind, source code, docstring, and file context. Supports conditional blocks for optional fields.

### Database Query Modules (`packages/core/src/db/queries/`)

- **summaries.ts** — CRUD for `prism_summaries` table: insert, bulk insert, get by target ID, get by project, delete by project, get existing input hashes for staleness detection.

- **embeddings.ts** — CRUD and similarity search for `prism_embeddings` table: insert, bulk insert, delete by project. Two similarity search modes:
  - `similaritySearch()` — Full join with symbols and files tables
  - `simpleSimilaritySearch()` — Lightweight search parsing target_id for symbol info

### Pipeline Integration (`packages/core/src/indexer/pipeline.ts`)

The `executeSemanticLayer()` function:
1. Gets all symbols and files for the project from DB
2. Groups symbols by file, reads file content from disk
3. Filters to summarisable symbols (function, class, interface, enum)
4. Processes in batches using `summariseBatch()`
5. Stores summaries via `bulkInsertSummaries()`
6. Embeds summaries using the configured provider
7. Stores embeddings via `bulkInsertEmbeddings()`
8. Tracks cost via BudgetTracker, creates index run records

### CLI Search Command (`packages/app/src/cli/commands/search.ts`)

`prism search <project> "query"` command:
- Accepts project by ID or path
- Embeds the query using the configured embedding provider
- Runs pgvector cosine similarity search
- Prints formatted table with rank, score, kind, symbol, file, and summary

### Dashboard Search (`packages/app/src/dashboard/`)

- **routes/search.ts** — `GET /projects/:id/search?q=...` with HTMX support
- **views/search.ts** — Search page with debounced input (300ms delay), results table with score badges, full page and HTMX fragment rendering

## Files Created/Modified

### Created
- `prompts/summarize-function.md`
- `packages/core/src/indexer/semantic/chunker.ts`
- `packages/core/src/indexer/semantic/summarizer.ts`
- `packages/core/src/indexer/semantic/embedder.ts`
- `packages/core/src/indexer/semantic/chunker.test.ts`
- `packages/core/src/indexer/semantic/summarizer.test.ts`
- `packages/core/src/indexer/semantic/embedder.test.ts`
- `packages/core/src/db/queries/summaries.ts`
- `packages/core/src/db/queries/embeddings.ts`
- `packages/app/src/cli/commands/search.ts`
- `packages/app/src/cli/commands/search.test.ts`
- `packages/app/src/dashboard/routes/search.ts`
- `packages/app/src/dashboard/views/search.ts`

### Modified
- `packages/core/src/indexer/pipeline.ts` — Added semantic layer execution
- `packages/core/src/indexer/index.ts` — Added semantic module exports
- `packages/core/src/db/queries/index.ts` — Added summaries and embeddings exports
- `packages/app/src/cli/index.ts` — Registered search command
- `packages/app/src/dashboard/server.ts` — Registered search router
- `packages/app/src/dashboard/views/index.ts` — Added search view exports
- `packages/core/package.json` — Added `@anthropic-ai/sdk` dependency

## Dependencies Added

- `@anthropic-ai/sdk` — Anthropic API client for Claude Haiku summarisation

## Test Results

- 181 tests passing (39 new tests for semantic layer)
- New test files: chunker.test.ts (14 tests), summarizer.test.ts (11 tests), embedder.test.ts (10 tests), search.test.ts (4 tests)
- All tests mock external API calls

## Configuration

Existing `prism.config.yaml` settings used:
```yaml
semantic:
  enabled: true
  model: "claude-haiku-4-5-20251001"
  embeddingProvider: "voyage"
  embeddingModel: "voyage-code-3"
  embeddingDimensions: 1536
  budgetUsd: 10.0
```

## Environment Variables Required

- `ANTHROPIC_API_KEY` — For Claude Haiku summarisation
- `VOYAGE_API_KEY` — For Voyage AI embeddings (when embeddingProvider is "voyage")
- `OPENAI_API_KEY` — For OpenAI embeddings (when embeddingProvider is "openai")

## Known Limitations

- Semantic layer requires API keys to function; without them it will fail gracefully
- The similarity search with full symbol join (`similaritySearch`) uses a somewhat complex SQL query; `simpleSimilaritySearch` is the primary search path
- Token estimation uses a simple 4-chars-per-token heuristic rather than a real tokeniser
- No retry logic for transient API failures (could be added in a future milestone)

## Next Milestones

- Milestone 8: Layer 4 — Analysis (pattern detection, architecture review)
- Milestone 9: Layer 5 — Blueprint generation
