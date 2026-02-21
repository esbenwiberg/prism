# Milestone 2 Handoff: Database Schema & Connection

## What was done

Defined all Drizzle ORM tables, set up pgvector extension support, created connection singleton, migration runner with destructive SQL guard, and generated the initial migration.

## Files created/modified

### New files
- `packages/core/src/db/schema.ts` — All 9 `prism_` tables with full column definitions
- `packages/core/src/db/connection.ts` — Pool + Drizzle singleton, lazy-initialised from `DATABASE_URL`
- `packages/core/src/db/migrate.ts` — Migration runner with destructive SQL guard
- `packages/core/src/db/index.ts` — Barrel export for db module
- `drizzle.config.ts` — Drizzle Kit configuration for migration generation
- `drizzle/0000_parallel_major_mapleleaf.sql` — Initial migration (all tables, FKs, HNSW index)

### Modified files
- `packages/core/src/index.ts` — Added `export * from "./db/index.js"`
- `packages/core/package.json` — Added drizzle-orm, pg, pgvector, @types/pg, drizzle-kit

### Removed files
- `packages/core/src/db/.gitkeep` — Replaced by real files
- `drizzle/.gitkeep` — Replaced by generated migration

## Database tables (all with `prism_` prefix)

| Table | Columns | Foreign Keys | Notes |
|---|---|---|---|
| prism_projects | 11 | 0 | UNIQUE on path |
| prism_files | 15 | 1 (projects) | UNIQUE(project_id, path) |
| prism_symbols | 11 | 2 (files, projects) | |
| prism_dependencies | 7 | 5 (projects, files x2, symbols x2) | nullable target FKs |
| prism_summaries | 8 | 1 (projects) | |
| prism_embeddings | 5 | 2 (projects, summaries) | vector(1536) + HNSW index |
| prism_findings | 9 | 1 (projects) | |
| prism_blueprints | 12 | 1 (projects) | |
| prism_index_runs | 12 | 1 (projects) | |

## Dependencies added to @prism/core

- `drizzle-orm` ^0.38.4
- `pg` ^8.18.0
- `pgvector` ^0.2.1
- `@types/pg` ^8.16.0 (devDep)
- `drizzle-kit` ^0.30.6 (devDep)

## Key design decisions

1. **Lazy connection singleton** — `getDb()` creates the Pool on first call; no connection is made at import time. This avoids issues in test environments.
2. **Destructive SQL guard** — `runMigrations()` reads migration SQL files and rejects DROP TABLE/SCHEMA/TRUNCATE unless `allowDestructive: true` is passed.
3. **Custom migrations table** — Migrations are tracked in `prism_migrations` (not the default `__drizzle_migrations`), keeping the `prism_` naming convention.
4. **ESM default import for pg** — Uses `import pg from "pg"` then `const { Pool } = pg` for ESM compatibility with the CommonJS `pg` package.
5. **HNSW index** — The embeddings table has an HNSW index using `vector_cosine_ops` for efficient similarity search.

## Verification

```
npm run build  ✅  Both packages compile
npm test       ✅  Passes (no test files yet)
npm run lint   ✅  Type-check passes
```

## Notes for next milestones

- The `queries/` subdirectory under `packages/core/src/db/` is not yet created; it will be added when query functions are implemented.
- `drizzle/meta/` is gitignored; only the SQL migration files are tracked.
- The `pgvector` npm package is installed but not directly used in code — drizzle-orm has built-in `vector()` column support. The pgvector package may be used later for direct vector operations.
- The migration runner calls `getDb()` internally, so DATABASE_URL must be set before running migrations.
