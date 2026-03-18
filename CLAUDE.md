# Prism — Codebase Analysis & Redesign Tool

## What is this?

Prism is a standalone tool that deeply indexes any codebase through a multi-layer pipeline (structural, documentation, purpose, semantic, analysis, blueprint) and produces actionable redesign proposals. Index once, query cheaply many times.

## Architecture

- **@prism/core** (`packages/core/`) — Indexing engine, database schema/queries, domain types, context enrichment, signal collectors, logger
- **@prism/app** (`packages/app/`) — CLI (commander), Express+HTMX dashboard (port 3100), blueprint generator, Entra ID auth

## Tech Stack

- Node.js 22, TypeScript (strict)
- PostgreSQL + pgvector for embeddings
- Drizzle ORM (^0.38.0) + drizzle-kit (^0.30.0)
- tree-sitter-wasms for code parsing (TS/JS, C#, Python)
- Pino for logging
- vitest for testing
- commander for CLI
- Express + HTMX for dashboard

## Pipeline Layers

1. **Structural** — tree-sitter parsing, symbol extraction, dependency graph, complexity/coupling/cohesion metrics
2. **Documentation** — doc file parsing, config detection, comment extraction, project intent assembly (persisted as summary level="intent")
3. **Purpose** — AI-synthesised App Purpose Document via Claude Sonnet
4. **Semantic** — Claude Haiku summaries per symbol with quality scoring (self-assessment + heuristic checks, retry/demote strategy), doc embedding (chunk docs by heading, summarise, embed), cross-file staleness propagation, vector embeddings via pgvector
5. **Analysis** — hierarchical summary rollup (file→module→system) using tiered models (Haiku for file/module, Sonnet for system), pattern detection (5 detectors with dedup + confidence), gap analysis with caching
6. **Blueprint** — on-demand AI-generated redesign proposals with phased milestones

## Context Enrichment (Query Time)

Signal collectors assemble task-relevant context:
- **Explicit file mentions** — regex extraction from queries, fuzzy resolution, Priority 1
- **Forward dependencies** — for mentioned files + shared coupling point detection
- **Semantic search** — partitioned into code + doc results, keyword boosting, full-text doc fallback
- **Blast radius** — aggregated reverse dep BFS with overlap ranking
- **Architecture context** — purpose doc, system summary, persisted intent
- **Change history** — commits, co-change patterns, hotspots

## Key Conventions

- All database tables use `prism_` prefix
- Config loaded from `prism.config.yaml` with env overrides (DB settings take priority)
- Prompts stored as markdown in `prompts/`
- Migrations in `drizzle/` (run automatically on deploy via entrypoint.sh)
- Test fixtures in `test/fixtures/` (golden repo for integration tests)
- Summary quality scores (0-1) on `prism_summaries`, embeddings gated at ≥ 0.4
- Finding dedup via fingerprinting, confidence scoring on `prism_findings`
- Analysis cost tracking via `cost_breakdown` on `prism_index_runs`
- `pnpm-workspace.yaml` for local dev, `"workspaces"` in root package.json for npm/Docker

## Commands

```bash
npm run build        # Build all packages
npm test             # Run tests with vitest (391 tests across 29 suites)
npm run lint         # Type-check without emitting
```

## Non-Goals

- No Hive integration (separate blueprint)
- No code execution or modification (read-only analysis)
- No IDE plugin / LSP server
- No SaaS hosting
- No non-git repos
