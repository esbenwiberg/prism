# Prism — Codebase Analysis & Redesign Tool

## Goal

A standalone tool that deeply indexes any codebase through a five-layer pipeline (structural, documentation, semantic, analysis, blueprint) and produces actionable redesign proposals. Index once, query cheaply many times. Handles enterprise-scale repos via incremental, git-aware re-indexing.

**Use cases**:
- **Redesign legacy apps** — understand what exists, propose a modern architecture
- **Productionize a PoC** — analyze a prototype, produce blueprints for a production-grade rebuild
- **Architectural audit** — detect anti-patterns, coupling issues, dead code, doc gaps
- **Onboard onto a codebase** — semantic search + hierarchical summaries for fast understanding

**Milestones: 8**

## Concrete Decisions

| Decision | Choice | Notes |
|----------|--------|-------|
| Node.js version | 22 | Latest LTS |
| CLI framework | commander | Lightweight, clean subcommand pattern |
| Database | Separate DB | Own connection string, not shared with Hive |
| Dashboard port | 3100 | Avoids conflict with Hive's 3000 |
| Embedding dimensions | 1536 (hardcoded) | If model changes, migrate the column |
| summaries.target_id | Polymorphic text | Level column disambiguates target type |
| findings/index_runs timestamps | Add created_at | Standard practice |
| Dashboard auth | Always required (Entra ID) | Same as Hive, no unauthenticated mode |
| tree-sitter grammars | tree-sitter-wasms npm package | Pre-built .wasm, covers major languages |
| Languages at launch | TS/JS, C#, Python | Three language families |
| analyze/blueprint commands | Separate from index | `index` runs layers 1-3, `analyze` and `blueprint` are distinct commands |
| Module detection | Language-aware heuristics | TS/JS: package.json + top-level src/ dirs; C#: .csproj/.sln projects; Python: dirs with \_\_init\_\_.py |
| Drizzle version | Match Hive (orm ^0.38.0, kit ^0.30.0) | Consistency across repos |
| Test fixtures | Small fixture repo in test/fixtures/ | TS, Python, C# sample files for deterministic integration tests |

## Non-Goals

- Hive integration (separate future blueprint)
- Code execution or modification (Prism only reads and analyzes)
- Real-time IDE plugin / LSP server
- SaaS multi-tenant hosting (single-instance tool for now)
- Supporting non-git repos (git is assumed)

## Acceptance Criteria

- [ ] `prism init ~/some-repo` registers a project and detects languages
- [ ] `prism index <project> --layers 1,2` completes structural + doc indexing in < 2min for a 5k-file repo
- [ ] `prism status <project>` shows per-layer progress, files processed, cost
- [ ] Dashboard at `prism serve` shows project overview, file browser with metrics, dependency findings
- [ ] Incremental re-indexing: change 1 file, re-index, only that file reprocessed
- [ ] `prism index <project> --layers 3` generates LLM summaries + embeddings for functions/classes
- [ ] `prism search <project> "authentication flow"` returns relevant code via semantic search
- [ ] `prism analyze <project>` produces hierarchical summaries + architectural findings
- [ ] `prism blueprint <project>` generates subsystem-focused redesign proposals
- [ ] Budget guards stop LLM calls when limit exceeded
- [ ] `npm run build` and `npm test` pass across all packages

## Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────┐
│  @prism/app  (CLI + Dashboard + Blueprints)         │
│  ┌──────┐  ┌───────────┐  ┌──────────────────────┐  │
│  │ CLI  │  │ Dashboard  │  │ Blueprint Generator  │  │
│  └──┬───┘  └─────┬─────┘  └──────────┬───────────┘  │
│     │            │                    │              │
├─────┼────────────┼────────────────────┼──────────────┤
│  @prism/core  (Indexing Engine)       │              │
│  ┌──────────────────────────────────┐ │              │
│  │ Pipeline Orchestrator            │ │              │
│  │  Layer 1: Structural (tree-sit.) │ │              │
│  │  Layer 2: Documentation          │ │              │
│  │  Layer 3: Semantic (LLM+embed)   │ │              │
│  │  Layer 4: Analysis (rollup+pat.) │ │              │
│  └──────────────┬───────────────────┘ │              │
│                 │                     │              │
│  ┌──────────────┴───────────────────┐ │              │
│  │ DB Schema + Queries (Drizzle)    │ │              │
│  └──────────────┬───────────────────┘ │              │
└─────────────────┼─────────────────────┘              │
                  │                                    │
          ┌───────┴────────┐                           │
          │ PostgreSQL     │                           │
          │ + pgvector     │                           │
          └────────────────┘                           │
```

### Data Flow

1. **Init**: User points at a folder → project row created, quick file scan
2. **Index Layer 1**: Walk files → tree-sitter parse → symbols + dependency graph + metrics → DB
3. **Index Layer 2**: Find docs/configs → parse → intent layer → DB
4. **Index Layer 3**: For each symbol → LLM summary (Haiku) → embed description → pgvector
5. **Index Layer 4**: Rollup summaries hierarchically → detect patterns on graph → findings → DB
6. **Blueprint (Layer 5)**: Feed understanding + findings to Claude (Sonnet) → redesign proposals → DB
7. **Dashboard**: Read from DB, render as HTML via Express + HTMX

### Incremental Re-Indexing

- Each file tracked by SHA-256 `contentHash`
- Each project tracks `lastIndexedCommit`
- On re-index: `git diff --name-only <last>..HEAD` → changed files only
- Layer 3 summaries track `inputHash` → stale summaries regenerated
- Cost of re-indexing 10 changed files in 50k repo: ~1s (L1), ~$0.01 (L3)

## Folder/File Layout

```
prism/
  packages/
    core/                          # @prism/core — indexing engine
      src/
        indexer/
          pipeline.ts              # Orchestrator: sequential layers, error handling, budget
          types.ts                 # IndexContext, LayerResult, BudgetTracker, FileEntry
          structural/
            parser.ts              # web-tree-sitter init + grammar loading
            extractor.ts           # Symbol extraction from AST
            graph.ts               # Dependency graph builder
            metrics.ts             # Complexity, coupling, cohesion
            languages.ts           # Language detection + grammar registry
          docs/
            readme.ts              # README/docs parsing
            comments.ts            # Inline comment + docstring extraction
            config.ts              # Config file detection + purpose
            intent.ts              # Intent layer assembly
          semantic/
            summarizer.ts          # Per-function/class LLM description (Haiku)
            embedder.ts            # Embedding model client (configurable provider)
            chunker.ts             # AST-aware chunking
          analysis/
            rollup.ts              # Hierarchical summary rollup
            patterns.ts            # Pattern detection orchestrator
            detectors/
              circular-deps.ts     # Tarjan's algorithm on dependency graph
              god-modules.ts       # High fan-in + fan-out heuristic
              dead-code.ts         # Unreachable symbols
              layering.ts          # Cross-layer import violations
              coupling.ts          # Coupling/cohesion thresholds
            gap-analysis.ts        # Docs intent vs code reality
        db/
          connection.ts            # pg Pool + Drizzle instance
          schema.ts                # All prism_ tables
          migrate.ts               # Migration runner (destructive SQL guard)
          queries/
            projects.ts
            files.ts
            symbols.ts
            dependencies.ts
            summaries.ts
            embeddings.ts
            findings.ts
            index-runs.ts
        domain/
          types.ts                 # Enums (IndexStatus, LayerName, SymbolKind, etc.)
          config.ts                # YAML + DB config loading (Hive pattern)
        logger.ts                  # Pino singleton
        index.ts                   # Package entry: exports pipeline, db, types
      package.json
      tsconfig.json
    app/                           # @prism/app — CLI + dashboard + blueprints
      src/
        cli/
          index.ts                 # Arg parsing, command dispatch
          commands/
            init.ts
            index-cmd.ts
            analyze.ts
            blueprint-cmd.ts
            serve.ts
            status.ts
            search.ts
        dashboard/
          server.ts                # Express setup
          routes/
            overview.ts
            project.ts
            files.ts
            modules.ts
            graph.ts
            findings.ts
            blueprints.ts
            search.ts
          views/
            layout.ts             # Page shell (sidebar, topbar)
            components.ts         # escapeHtml, badge, card, table, statCard
            overview.ts
            project.ts
            files.ts
            modules.ts
            graph.ts
            findings.ts
            blueprints.ts
            search.ts
          public/
            htmx-ext.js
            graph.js              # Client-side D3 graph rendering
        blueprint/
          generator.ts            # Feed understanding to Claude → proposals
          splitter.ts             # Split large redesigns by subsystem
          types.ts                # Blueprint, Risk, ModuleChange types
        auth/
          entra.ts                # Azure Entra ID (same pattern as Hive)
          session.ts
          middleware.ts
        domain/
          types.ts
        index.ts                  # Entry point for serve mode
      package.json
      tsconfig.json
  prompts/                        # LLM prompt templates (.md files)
    summarize-function.md
    summarize-file.md
    summarize-module.md
    summarize-system.md
    gap-analysis.md
    blueprint.md
  test/
    fixtures/                      # Small TS, Python, C# sample projects for integration tests
  grammars/                        # Symlink/copy from tree-sitter-wasms at install
  drizzle/                         # Generated migrations
  blueprints/                      # This file lives here
  package.json                    # Workspace root
  tsconfig.base.json              # Shared TS config
  prism.config.yaml               # Default configuration
  vitest.config.ts
  drizzle.config.ts
  .env.example
  CLAUDE.md
```

## Database Schema

All tables use `prism_` prefix. PostgreSQL + pgvector extension.

### Tables

**prism_projects**
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| name | text | Display name |
| path | text UNIQUE | Absolute filesystem path |
| language | text | Primary detected language |
| total_files | integer | |
| total_symbols | integer | |
| index_status | text | pending/running/completed/failed/partial |
| last_indexed_commit | text | Git SHA for incremental |
| settings | jsonb | Per-project overrides |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**prism_files**
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| project_id | FK → projects | CASCADE delete |
| path | text | Relative path within project |
| language | text | |
| size_bytes | integer | |
| line_count | integer | |
| content_hash | text | SHA-256 for incremental |
| complexity | numeric(8,2) | Cyclomatic complexity |
| coupling | numeric(8,2) | Afferent + efferent |
| cohesion | numeric(8,2) | |
| is_doc | boolean | README, .md, etc. |
| is_test | boolean | |
| is_config | boolean | |
| doc_content | text | Parsed doc content (Layer 2) |
| metadata | jsonb | |
| UNIQUE(project_id, path) | | |

**prism_symbols**
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| file_id | FK → files | CASCADE |
| project_id | FK → projects | CASCADE |
| kind | text | function/class/interface/type/export/import/enum |
| name | text | |
| start_line | integer | |
| end_line | integer | |
| exported | boolean | |
| signature | text | Full signature |
| docstring | text | Extracted JSDoc/docstring |
| complexity | numeric(8,2) | |

**prism_dependencies**
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| project_id | FK → projects | CASCADE |
| source_file_id | FK → files | CASCADE |
| target_file_id | FK → files | nullable CASCADE |
| source_symbol_id | FK → symbols | nullable CASCADE |
| target_symbol_id | FK → symbols | nullable CASCADE |
| kind | text | import/call/extends/implements |

**prism_summaries**
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| project_id | FK → projects | CASCADE |
| level | text | function/file/module/system |
| target_id | text | symbol.id, file.id, module path, or "system" |
| content | text | LLM-generated description |
| model | text | Model used |
| input_hash | text | Hash of input → detect staleness |
| cost_usd | numeric(10,4) | |

**prism_embeddings**
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| project_id | FK → projects | CASCADE |
| summary_id | FK → summaries | CASCADE |
| embedding | vector(1536) | pgvector, HNSW indexed |
| model | text | Embedding model used |

**prism_findings**
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| project_id | FK → projects | CASCADE |
| category | text | circular-dep/god-module/dead-code/layering/coupling/gap/tech-debt |
| severity | text | critical/high/medium/low/info |
| title | text | |
| description | text | |
| evidence | jsonb | Files, symbols, metrics |
| suggestion | text | Remediation hint |
| created_at | timestamptz | |

**prism_blueprints**
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| project_id | FK → projects | CASCADE |
| title | text | |
| subsystem | text | Which part of codebase |
| summary | text | |
| proposed_architecture | text | |
| module_changes | jsonb | Structured changes |
| migration_path | text | |
| risks | jsonb | [{risk, impact, mitigation}] |
| rationale | text | |
| model | text | |
| cost_usd | numeric(10,4) | |

**prism_index_runs**
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| project_id | FK → projects | CASCADE |
| layer | text | structural/docs/semantic/analysis/blueprint |
| status | text | pending/running/completed/failed |
| files_processed | integer | |
| files_total | integer | |
| cost_usd | numeric(10,4) | |
| duration_ms | integer | |
| error | text | |
| started_at | timestamptz | |
| completed_at | timestamptz | |
| created_at | timestamptz | |

## Configuration

```yaml
# prism.config.yaml
structural:
  skipPatterns:
    - "node_modules/**"
    - ".git/**"
    - "dist/**"
    - "build/**"
    - "vendor/**"
    - "*.min.js"
    - "*.min.css"
    - "*.lock"
    - "*.map"
  maxFileSizeBytes: 1048576  # 1MB

semantic:
  enabled: true
  model: "claude-haiku-4-5-20251001"
  embeddingProvider: "voyage"        # or "openai" — configurable
  embeddingModel: "voyage-code-3"
  embeddingDimensions: 1536
  budgetUsd: 10.0

analysis:
  enabled: true
  model: "claude-sonnet-4-6-20250514"
  budgetUsd: 5.0

blueprint:
  enabled: true
  model: "claude-sonnet-4-6-20250514"
  budgetUsd: 5.0

indexer:
  batchSize: 100
  maxConcurrentBatches: 4
  incrementalByDefault: true

dashboard:
  port: 3100
```

## Milestones

### Milestone 1: Monorepo Scaffolding

**Intent**: Set up the workspace structure, TypeScript config, package.json files, basic tooling.

**Key files created**:
- `package.json` (workspace root with npm workspaces)
- `tsconfig.base.json` (shared TS config)
- `packages/core/package.json`, `packages/core/tsconfig.json`
- `packages/app/package.json`, `packages/app/tsconfig.json`
- `vitest.config.ts`
- `prism.config.yaml` (defaults)
- `.env.example`
- `CLAUDE.md`
- `.gitignore`

**Verification**:
```bash
npm install
npm run build        # tsc compiles both packages
npm test             # vitest runs (no tests yet, but exits clean)
```

---

### Milestone 2: Database Schema & Connection

**Intent**: Define all Drizzle tables, set up pgvector extension, migration runner, connection singleton.

**Key files created/modified**:
- `packages/core/src/db/schema.ts` — all `prism_` tables
- `packages/core/src/db/connection.ts` — Pool + Drizzle
- `packages/core/src/db/migrate.ts` — migration runner with destructive SQL guard
- `packages/core/src/logger.ts` — Pino singleton
- `drizzle.config.ts`
- Initial migration in `drizzle/`

**Verification**:
```bash
# With a running PostgreSQL:
npm run db:migrate   # Creates all tables + pgvector extension
psql $DATABASE_URL -c "\dt prism_*"  # Lists all prism_ tables
```

---

### Milestone 3: CLI Skeleton + Config

**Intent**: Basic CLI with `init`, `index`, `status`, `serve` commands. Config loading from YAML.

**Key files created**:
- `packages/core/src/domain/config.ts` — YAML loading, defaults, getConfig/initConfig
- `packages/core/src/domain/types.ts` — all enums and interfaces
- `packages/app/src/cli/index.ts` — arg parsing, dispatch
- `packages/app/src/cli/commands/init.ts` — register project
- `packages/app/src/cli/commands/index-cmd.ts` — run pipeline (stub)
- `packages/app/src/cli/commands/status.ts` — show progress
- `packages/app/src/cli/commands/serve.ts` — start dashboard (stub)
- `packages/core/src/db/queries/projects.ts` — project CRUD

**Verification**:
```bash
npx tsx packages/app/src/cli/index.ts init ~/some-test-repo
# → "Project 'some-test-repo' registered (id: 1, 234 files detected)"
npx tsx packages/app/src/cli/index.ts status 1
# → Shows project info, no layers run yet
```

---

### Milestone 4: Layer 1 — Structural Indexing (tree-sitter)

**Intent**: Parse every file with tree-sitter, extract symbols, build dependency graph, compute metrics. The core of the whole tool.

**Key files created**:
- `packages/core/src/indexer/pipeline.ts` — orchestrator
- `packages/core/src/indexer/types.ts` — IndexContext, LayerResult, etc.
- `packages/core/src/indexer/structural/parser.ts` — web-tree-sitter init
- `packages/core/src/indexer/structural/extractor.ts` — symbol extraction
- `packages/core/src/indexer/structural/graph.ts` — dependency graph builder
- `packages/core/src/indexer/structural/metrics.ts` — complexity, coupling
- `packages/core/src/indexer/structural/languages.ts` — grammar registry
- `packages/core/src/db/queries/files.ts` — file upsert + hash check
- `packages/core/src/db/queries/symbols.ts` — bulk insert
- `packages/core/src/db/queries/dependencies.ts` — edge upsert
- `grammars/*.wasm` — pre-built grammars for top languages

**Verification**:
```bash
npx tsx packages/app/src/cli/index.ts index 1 --layers 1
# → "Layer structural: 234 files, 1,847 symbols, 12 seconds"
npx tsx packages/app/src/cli/index.ts status 1
# → structural: completed (234 files, 1847 symbols)

# Incremental test:
touch ~/some-test-repo/src/index.ts
npx tsx packages/app/src/cli/index.ts index 1 --layers 1
# → "Layer structural: 1 file changed, 14 symbols updated, 0.3 seconds"
```

---

### Milestone 5: Layer 2 — Documentation Parsing

**Intent**: Parse README, docs, config files, inline comments. Build the "intent layer" — what the app is supposed to do.

**Key files created**:
- `packages/core/src/indexer/docs/readme.ts`
- `packages/core/src/indexer/docs/comments.ts`
- `packages/core/src/indexer/docs/config.ts`
- `packages/core/src/indexer/docs/intent.ts`

**Verification**:
```bash
npx tsx packages/app/src/cli/index.ts index 1 --layers 2
# → "Layer docs: 12 doc files, 45 config files, 0.8 seconds"
# Check DB: prism_files rows with is_doc=true have doc_content populated
```

---

### Milestone 6: Dashboard MVP

**Intent**: Express + HTMX dashboard with project overview, file browser with metrics, basic findings from graph analysis (circular deps, dead code candidates).

**Key files created**:
- `packages/app/src/dashboard/server.ts`
- `packages/app/src/dashboard/views/layout.ts`
- `packages/app/src/dashboard/views/components.ts`
- `packages/app/src/dashboard/views/overview.ts`
- `packages/app/src/dashboard/views/project.ts`
- `packages/app/src/dashboard/views/files.ts`
- `packages/app/src/dashboard/views/findings.ts`
- `packages/app/src/dashboard/routes/overview.ts`
- `packages/app/src/dashboard/routes/project.ts`
- `packages/app/src/dashboard/routes/files.ts`
- `packages/app/src/dashboard/routes/findings.ts`
- `packages/app/src/dashboard/public/htmx-ext.js`
- `packages/app/src/auth/entra.ts` — Entra ID auth (Hive pattern)
- `packages/app/src/auth/session.ts`
- `packages/app/src/auth/middleware.ts`
- Basic graph analysis: `packages/core/src/indexer/analysis/detectors/circular-deps.ts`
- Basic graph analysis: `packages/core/src/indexer/analysis/detectors/dead-code.ts`

**Verification**:
```bash
npx tsx packages/app/src/cli/index.ts serve
# → "Dashboard at http://localhost:3100"
# Browser: project list, click project → stats + file table + findings
```

---

### Milestone 7: Layer 3 — Semantic (LLM Summaries + Embeddings)

**Intent**: Generate LLM descriptions for functions/classes, embed them, enable semantic search. This is where Prism gets intelligent.

**Key files created**:
- `packages/core/src/indexer/semantic/summarizer.ts`
- `packages/core/src/indexer/semantic/embedder.ts` — pluggable provider interface
- `packages/core/src/indexer/semantic/chunker.ts`
- `packages/core/src/db/queries/summaries.ts`
- `packages/core/src/db/queries/embeddings.ts`
- `packages/app/src/cli/commands/search.ts`
- `packages/app/src/dashboard/routes/search.ts`
- `packages/app/src/dashboard/views/search.ts`
- `prompts/summarize-function.md`

**Verification**:
```bash
npx tsx packages/app/src/cli/index.ts index 1 --layers 3 --budget 2
# → "Layer semantic: 1,847 symbols summarized, 1,847 embeddings, $1.23, 4 minutes"
npx tsx packages/app/src/cli/index.ts search 1 "authentication flow"
# → Top 10 results with file paths, symbol names, relevance scores

# Dashboard: /projects/1/search with live HTMX search
```

---

### Milestone 8: Layers 4+5 — Analysis + Blueprints

**Intent**: Hierarchical summary rollup, full pattern detection, gap analysis, and redesign blueprint generation.

**Key files created**:
- `packages/core/src/indexer/analysis/rollup.ts`
- `packages/core/src/indexer/analysis/patterns.ts`
- `packages/core/src/indexer/analysis/detectors/god-modules.ts`
- `packages/core/src/indexer/analysis/detectors/layering.ts`
- `packages/core/src/indexer/analysis/detectors/coupling.ts`
- `packages/core/src/indexer/analysis/gap-analysis.ts`
- `packages/core/src/db/queries/findings.ts`
- `packages/app/src/blueprint/generator.ts`
- `packages/app/src/blueprint/splitter.ts`
- `packages/app/src/blueprint/types.ts`
- `packages/app/src/cli/commands/analyze.ts`
- `packages/app/src/cli/commands/blueprint-cmd.ts`
- `packages/app/src/dashboard/routes/blueprints.ts`
- `packages/app/src/dashboard/views/blueprints.ts`
- `packages/app/src/dashboard/routes/graph.ts`
- `packages/app/src/dashboard/views/graph.ts`
- `packages/app/src/dashboard/public/graph.js` — D3 rendering
- `prompts/summarize-file.md`, `summarize-module.md`, `summarize-system.md`
- `prompts/gap-analysis.md`, `prompts/blueprint.md`

**Verification**:
```bash
npx tsx packages/app/src/cli/index.ts analyze 1
# → "Layer analysis: 5 module summaries, 1 system summary, 14 findings, $3.45"
npx tsx packages/app/src/cli/index.ts blueprint 1
# → "Generated 3 blueprints covering: auth, data-layer, api-surface"

# Dashboard: /projects/1/findings with severity filters
# Dashboard: /projects/1/blueprints with full proposals
# Dashboard: /projects/1/graph with interactive D3 visualization
```

## Risks & Unknowns

| Risk | Impact | Probe |
|------|--------|-------|
| web-tree-sitter WASM loading in ESM Node 22 | Blocks Layer 1 entirely | `npm install web-tree-sitter && node -e "import('web-tree-sitter')"` — test immediately in M1 |
| tree-sitter-wasms coverage for TS/JS, C#, Python | Missing language support | Verify package includes grammars for all three; fallback: build from source |
| pgvector extension not available on target PostgreSQL | Blocks Layer 3 | `CREATE EXTENSION IF NOT EXISTS vector` — test in M2 |
| Cyclomatic complexity calculation from tree-sitter AST | May need language-specific logic | Prototype on TypeScript AST first, see if generic approach works |
| Budget tracking accuracy for Claude API calls | Cost overruns | Use Anthropic SDK's usage response fields, track tokens precisely |
| Large module rollup exceeding Claude context | Truncated/poor analysis | Map-reduce: batch 20-30 file summaries per call, summarize batches |
| D3 graph rendering with 1000+ nodes | Unusable UI | Default to module-level (collapsed), drill to expand. Consider sigma.js for WebGL |

Next: /probe 'Milestone 1 — Monorepo scaffolding'
