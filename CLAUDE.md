# Prism — Codebase Analysis & Redesign Tool

## What is this?

Prism is a standalone tool that deeply indexes any codebase through a five-layer pipeline (structural, documentation, semantic, analysis, blueprint) and produces actionable redesign proposals. Index once, query cheaply many times.

## Architecture

- **@prism/core** (`packages/core/`) — Indexing engine, database schema/queries, domain types, logger
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

## Key Conventions

- All database tables use `prism_` prefix
- Config loaded from `prism.config.yaml` with env overrides
- Prompts stored as markdown in `prompts/`
- Migrations in `drizzle/`
- Test fixtures in `test/fixtures/`

## Commands

```bash
npm run build        # Build all packages
npm test             # Run tests with vitest
npm run lint         # Type-check without emitting
```

## Non-Goals

- No Hive integration (separate blueprint)
- No code execution or modification (read-only analysis)
- No IDE plugin / LSP server
- No SaaS hosting
- No non-git repos
