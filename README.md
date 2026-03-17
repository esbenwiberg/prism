# Prism

**Deep codebase analysis and redesign tool.** Index once, query cheaply many times.

Prism indexes any codebase through a multi-layer pipeline — structural parsing, documentation extraction, LLM-powered semantic understanding, git history analysis, architectural pattern detection, and redesign blueprint generation — then serves the results through a CLI, an interactive dashboard, a REST API, and an MCP server for AI agent integration.

```
prism init ~/my-project
prism index my-project --layer structural
prism index my-project --layer semantic
prism index my-project --layer history
prism analyze my-project
prism blueprint my-project --goal "Productionize this PoC for enterprise deployment"
prism serve
```

---

## What It Does

| Use Case | How Prism Helps |
|----------|----------------|
| **Redesign a legacy app** | Understand what exists, detect anti-patterns, get a proposed modern architecture |
| **Productionize a PoC** | Analyze a prototype, produce blueprints for a production-grade rebuild |
| **Architectural audit** | Detect circular dependencies, god modules, dead code, coupling issues, doc gaps |
| **Onboard onto a codebase** | Semantic search + hierarchical summaries for fast understanding |
| **Power AI coding agents** | MCP server + context enricher gives agents token-budget-aware, multi-signal codebase context |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  @prism/app                                                  │
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │   CLI    │  │  Dashboard   │  │  Blueprint Generator   │  │
│  │commander │  │ Express+HTMX │  │    Claude Sonnet       │  │
│  └────┬─────┘  └──────┬───────┘  └───────────┬────────────┘  │
│       │               │                      │               │
│       │          ┌────┴─────┐  ┌──────────┐  │               │
│       │          │ REST API │  │MCP Server│  │               │
│       │          │ /api/*   │  │ /mcp     │  │               │
│       │          └────┬─────┘  └────┬─────┘  │               │
│       │               │             │        │               │
├───────┼───────────────┼─────────────┼────────┼───────────────┤
│  @prism/core                                                 │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Pipeline Orchestrator                     │  │
│  │                                                        │  │
│  │  Layer 1  ─►  Layer 2  ─►  Layer 3  ─►  Layer 4      │  │
│  │  Structural   Docs        Semantic      Analysis       │  │
│  │  tree-sitter  README      Claude Haiku  Rollup +       │  │
│  │  parsing      configs     summaries     pattern        │  │
│  │  symbols      comments    embeddings    detection      │  │
│  │  deps graph   intent      pgvector                     │  │
│  │                                                        │  │
│  │  History Layer          Context Enricher               │  │
│  │  git log parsing        multi-signal assembly          │  │
│  │  co-change patterns     token-budget-aware             │  │
│  │  change frequency       ranked context for agents      │  │
│  └───────────────────────────┬────────────────────────────┘  │
│                              │                               │
│  ┌───────────────────────────┴────────────────────────────┐  │
│  │           Database (Drizzle ORM)                       │  │
│  │  13 tables: projects, files, symbols, dependencies,    │  │
│  │  summaries, embeddings, findings, blueprints, runs,    │  │
│  │  commits, commit_files, api_keys, reindex_requests     │  │
│  └───────────────────────────┬────────────────────────────┘  │
└──────────────────────────────┼───────────────────────────────┘
                               │
                     ┌─────────┴──────────┐
                     │    PostgreSQL       │
                     │    + pgvector       │
                     └────────────────────┘
```

### Data Flow

```
  ┌─────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌───────────┐
  │  init   │────►│  Layer 1    │────►│   Layer 2    │────►│   Layer 3    │────►│  Layer 4  │
  │         │     │  Structural │     │    Docs      │     │   Semantic   │     │  Analysis │
  │ register│     │             │     │              │     │              │     │           │
  │ project │     │ tree-sitter │     │ README parse │     │ Claude Haiku │     │ rollup    │
  │ detect  │     │ symbols     │     │ config parse │     │ summaries    │     │ patterns  │
  │ language│     │ deps graph  │     │ comments     │     │ embeddings   │     │ gap       │
  │ count   │     │ metrics     │     │ intent       │     │ pgvector     │     │ analysis  │
  │ files   │     │             │     │              │     │              │     │           │
  └─────────┘     └─────────────┘     └──────────────┘     └──────────────┘     └─────┬─────┘
                                                                                      │
                         ┌──────────────┐                                             ▼
                         │   History    │                                       ┌───────────┐
                         │              │     ┌──────────────┐                  │  Layer 5  │
                         │ git log      │     │   Context    │                  │ Blueprint │
                         │ co-changes   │     │  Enricher    │                  │           │
                         │ hotspots     │     │              │                  │ Claude    │
                         │              │     │ multi-signal │                  │ Sonnet    │
                         └──────┬───────┘     │ budget-aware │                  │ redesign  │
                                │             │ ranked       │                  │ proposals │
                                ▼             └──────┬───────┘                  └───────────┘
                  ┌──────────────┐                   │
                  │  Dashboard   │◄──────────────────┤
                  │  REST API    │     ┌──────────────┘
                  │  MCP Server  │     │
                  │              │     ▼
                  │ overview     │  ┌──────────────┐
                  │ file browser │  │   search     │
                  │ findings     │  │              │
                  │ blueprints   │  │ embed query  │
                  │ dep graph    │  │ cosine sim   │
                  │ modules      │  │ ranked       │
                  │              │  │ results      │
                  └──────────────┘  └──────────────┘
```

### Incremental Re-Indexing

Prism tracks every file by SHA-256 content hash and every project by its last indexed git commit. On re-index:

```
  git diff --name-only <last-commit>..HEAD  ──►  changed files only
                                                        │
                                            ┌───────────┴───────────┐
                                            │  content hash check   │
                                            │  skip unchanged files │
                                            └───────────┬───────────┘
                                                        │
                                            ┌───────────┴───────────┐
                                            │  input hash check     │
                                            │  skip unchanged       │
                                            │  LLM summaries        │
                                            └───────────────────────┘
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 22 |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL + pgvector |
| ORM | Drizzle ORM |
| Code Parsing | tree-sitter (WASM) — TS/JS, Python, C# |
| LLM Summaries | Claude Haiku via Anthropic SDK (or Azure AI Foundry) |
| LLM Analysis | Claude Sonnet via Anthropic SDK (or Azure AI Foundry) |
| Embeddings | Voyage AI, OpenAI, or Azure OpenAI (configurable) |
| CLI | Commander |
| Dashboard | Express + HTMX (server-rendered) |
| REST API | Express — semantic search, context enricher, findings, project management |
| MCP Server | Stateless Streamable HTTP — 11 tools for AI agent integration |
| Auth | Azure Entra ID (MSAL) + API key auth for programmatic access |
| Logging | Pino |
| Testing | Vitest |

---

## Getting Started

### Prerequisites

- Node.js >= 22
- PostgreSQL with [pgvector](https://github.com/pgvector/pgvector) extension
- Azure Entra ID app registration (for dashboard auth)

### Installation

```bash
git clone https://github.com/esbenwiberg/prism.git
cd prism
npm install
npm run build
```

### Environment Setup

Copy `.env.example` and fill in your values:

```bash
cp .env.example .env
```

```env
# Required
DATABASE_URL=postgresql://localhost:5432/prism

# For LLM summaries / analysis / blueprints — choose one provider
ANTHROPIC_API_KEY=sk-ant-...
# Or use Azure AI Foundry:
# ANTHROPIC_BASE_URL=https://your-resource.services.ai.azure.com/api

# For embeddings — choose one provider
EMBEDDING_PROVIDER=voyage          # or "openai" or "azure-openai"
VOYAGE_API_KEY=pa-...              # if using Voyage
OPENAI_API_KEY=sk-...              # if using OpenAI
# AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
# AZURE_OPENAI_API_KEY=...         # if using Azure OpenAI

# For dashboard auth
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
SESSION_SECRET=your-secret-here

# For API / MCP access (or generate keys via dashboard)
PRISM_API_KEY=prism_...

# Optional
DASHBOARD_PORT=3100                # default: 3100
SKIP_AUTH=true                     # bypass Entra ID in development
LOG_LEVEL=info                     # debug, info, warn, error
```

### Database Setup

Ensure pgvector is installed, then run migrations:

```sql
CREATE DATABASE prism;
\c prism
CREATE EXTENSION IF NOT EXISTS vector;
```

```bash
npx drizzle-kit migrate
```

---

## CLI Reference

### `prism init [path]`

Register a project for indexing. Scans the directory to count files and detect the primary language.

```bash
prism init ~/repos/my-app
prism init ~/repos/my-app --name "My App"
```

```
Project 'my-app' registered (id: 1, 1,847 files detected, primary language: TypeScript)
```

### `prism index [path]`

Run the indexing pipeline. Supports layer selection and incremental indexing by default.

```bash
prism index my-app                        # run all configured layers
prism index my-app --layer structural     # Layer 1 only
prism index my-app --layer docs           # Layer 2 only
prism index my-app --layer semantic       # Layer 3 (LLM summaries + embeddings)
prism index my-app --layer analysis       # Layer 4 (rollup + pattern detection)
prism index my-app --layer history        # Git history (co-changes, hotspots)
prism index my-app --full                 # force full re-index
```

### `prism status [path]`

Show indexing progress with per-layer details and cost tracking.

```bash
prism status my-app
prism status --all                        # all registered projects
```

```
Project: my-app (id: 1)
Path:    /home/user/repos/my-app
Status:  completed
Files:   1,847 | Symbols: 12,340

Layer        Status     Progress      Cost        Duration
structural   completed  1847/1847     $0.0000     12.3s
docs         completed  234/234       $0.0000     0.8s
semantic     completed  1847/1847     $1.2300     4m 12s
analysis     completed  —             $3.4500     2m 45s

Total cost: $4.68
```

### `prism analyze <project>`

Run Layer 4: hierarchical summary rollup, pattern detection, and gap analysis.

```bash
prism analyze my-app
prism analyze my-app --full               # force full re-analysis
```

### `prism blueprint <project>`

Generate Layer 5: subsystem-focused redesign proposals. Use `--goal` to steer the
proposals toward a specific outcome, and `--focus` to limit scope to a subsystem.

```bash
prism blueprint my-app

# Steer proposals with a goal
prism blueprint my-app --goal "Productionize this PoC for enterprise deployment"
prism blueprint my-app --goal "Migrate from Express to Fastify and replace Sequelize with Drizzle"
prism blueprint my-app --goal "Improve testability and reduce coupling"

# Focus on a specific subsystem
prism blueprint my-app --focus src/api
prism blueprint my-app --goal "Modernize the data layer" --focus src/db
```

| Flag | Description |
|------|-------------|
| `-g, --goal <text>` | Redesign goal — all proposals will be aligned to this directive |
| `-f, --focus <path>` | Limit blueprint scope to findings and modules under this path |

### `prism search <project> "query"`

Semantic search across indexed symbols using pgvector cosine similarity.

```bash
prism search my-app "authentication flow"
prism search my-app "database connection pooling" --limit 20
```

```
 #  Score   Kind       Symbol              File                        Summary
 1  0.92    function   authenticateUser    src/auth/middleware.ts       Validates JWT token...
 2  0.87    class      AuthService         src/auth/service.ts         Handles user auth...
 3  0.84    function   createSession       src/auth/session.ts         Creates a new...
```

### `prism serve`

Start the dashboard.

```bash
prism serve                               # default port 3100
prism serve --port 4000
```

---

## Dashboard

The dashboard is a server-rendered Express + HTMX application with live partial updates.

| Route | Description |
|-------|-------------|
| `/` | Project overview — all registered projects with status badges |
| `/projects/:id` | Project detail — file/symbol/finding counts, navigation |
| `/projects/:id/files` | File browser — complexity, coupling, cohesion metrics per file |
| `/projects/:id/findings` | Findings — severity filter (critical/high/medium/low/info) |
| `/projects/:id/search` | Semantic search — debounced HTMX live search |
| `/projects/:id/modules` | Module overview — directory-level summaries and metrics |
| `/projects/:id/blueprints` | Redesign proposals — architecture, changes, risks, migration path |
| `/projects/:id/graph` | Dependency graph — interactive D3 force-directed visualization |

Authentication is via Azure Entra ID. Set `SKIP_AUTH=true` for local development.

---

## MCP Server

Prism exposes an MCP (Model Context Protocol) server for AI agent integration. Any MCP-compatible client (Claude Code, Cursor, etc.) can connect and query the indexed codebase.

**Endpoint:** `POST /mcp` (stateless Streamable HTTP transport)

**Auth:** API key via `Authorization: Bearer prism_...` header

**Claude Code configuration** (`.mcp.json`):

```json
{
  "mcpServers": {
    "prism": {
      "type": "http",
      "url": "https://your-prism-instance/mcp",
      "headers": {
        "Authorization": "Bearer prism_..."
      }
    }
  }
}
```

### Tools

| Tool | Description |
|------|-------------|
| `search_codebase` | Semantic search — returns relevant code snippets and module summaries |
| `get_file_context` | File-level context — summary, dependencies, symbols, findings, change history |
| `get_module_context` | Module-level context — purpose, files, public API, findings |
| `get_related_files` | Find related files via semantic similarity and dependency graph |
| `get_architecture_overview` | System-wide architecture — module map, inter-module dependencies, critical findings |
| `get_change_context` | Change history — recent commits, hotspots, co-change patterns |
| `get_review_context` | Drift review — recent changes vs architecture baseline |
| `get_project_status` | Project status — index state, file count, last index time, active jobs |
| `register_project` | Register a new project for indexing |
| `delete_project` | Delete a project and all associated data |
| `trigger_reindex` | Queue a reindex with optional layer selection |

All project-scoped tools take a `slug` parameter (`owner/repo` format).

---

## REST API

All API endpoints require a Bearer token (`Authorization: Bearer prism_...`). API keys can be generated via the dashboard or set via the `PRISM_API_KEY` environment variable.

### Search & Findings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/projects/:owner/:repo/search` | Semantic search — returns relevant code + module summaries |
| `GET` | `/api/projects/:owner/:repo/findings` | Static analysis findings (filterable by `severity`, `limit` query params) |

### Context Enricher

Token-budget-aware context assembly for AI agents. Each endpoint accepts a `maxTokens` parameter.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/projects/:owner/:repo/context/file` | File context — summary, deps, symbols, findings, history |
| `POST` | `/api/projects/:owner/:repo/context/module` | Module context — purpose, structure, public API |
| `POST` | `/api/projects/:owner/:repo/context/related` | Related files via semantic + dependency graph |
| `POST` | `/api/projects/:owner/:repo/context/arch` | Architecture overview |
| `POST` | `/api/projects/:owner/:repo/context/changes` | Change history, hotspots, co-change patterns |
| `POST` | `/api/projects/:owner/:repo/context/review` | Drift review — recent changes vs baseline |

### Project Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/projects/:owner/:repo/reindex` | Queue reindex (returns 202) |
| `DELETE` | `/api/projects/:owner/:repo` | Delete project and all data |

---

## The Indexing Layers

### Layer 1: Structural

Parses every file using [tree-sitter](https://tree-sitter.github.io/tree-sitter/) (WASM bindings) to extract a complete structural model.

**Languages supported**: TypeScript, TSX, JavaScript, Python, C#

**What it extracts**:
- Symbols: functions, classes, interfaces, types, enums, exports, imports
- Dependencies: import/export relationships between files
- Metrics: cyclomatic complexity, afferent/efferent coupling, cohesion

### Layer 2: Documentation

Parses all non-code files to build the "intent layer" — what the codebase is supposed to do.

**What it processes**:
- README files, changelogs, docs/ directories
- Config files (60+ patterns: package.json, tsconfig, Dockerfile, CI configs, etc.)
- Inline comments and docstrings (JSDoc, Python docstrings, C# XML docs)
- Assembles a structured `ProjectIntent` with description, architecture, and tech stack

### Layer 3: Semantic

Calls Claude Haiku to generate natural-language summaries of every function and class, then embeds them for vector search.

**Budget-controlled**: configurable `budgetUsd` limit, tracks actual API cost per token.

**Staleness detection**: SHA-256 hash of the prompt input — only re-summarizes when code changes.

**Embedding providers**: Voyage AI (`voyage-code-3`), OpenAI (`text-embedding-3-small`), or Azure OpenAI.

### Layer 4: Analysis

Rolls up summaries hierarchically (function → file → module → system) and runs pattern detectors.

**Detectors**:
| Detector | What it finds |
|----------|--------------|
| Circular Dependencies | Strongly connected components (Tarjan's algorithm) |
| Dead Code | Exported symbols with zero inbound references |
| God Modules | Files with excessive fan-in and fan-out |
| Layering Violations | Cross-layer imports (e.g., UI → DB directly) |
| Coupling Issues | Files exceeding coupling/cohesion thresholds |

**Gap Analysis**: Compares documentation intent with code reality to find discrepancies.

### Layer 5: Blueprint

Feeds the complete project understanding — system summary, all findings, and project intent — to Claude Sonnet to generate subsystem-focused redesign proposals.

Each blueprint includes: proposed architecture, module changes, migration path, risks with mitigations, and rationale.

### History Layer

Parses git history to extract change patterns and identify code hotspots.

**What it extracts**:
- Commit history with per-file change stats (additions, deletions)
- PR and ticket references from commit messages (e.g., `#123`, `JIRA-456`, `AB#789`)
- Change frequency and recency per file
- Co-change patterns — files that frequently change together

**Options**: configurable `maxCommits` (default 200), supports incremental and full reindex.

### Context Enricher

Assembles multi-signal, token-budget-aware context from all indexed data. Designed to give AI agents exactly the context they need without exceeding their token limits.

**Signal types collected**:
| Signal | Source |
|--------|--------|
| Summaries | File and module summaries from semantic analysis |
| Graph | Forward/reverse dependencies via BFS traversal |
| Findings | Static analysis findings scoped to file/module |
| Semantic | Intent-matched vector search results |
| History | Change frequency, co-changes, hotspots, recent commits |
| Symbols | Exported symbols with signatures |
| Architecture | Module map, inter-module dependencies |

**Context types**:
- **File** — everything about one file: summary, deps, symbols, findings, change history
- **Module** — directory overview: purpose, files, public API, findings
- **Related** — files related via semantic similarity and dependency graph
- **Architecture** — system-wide module map and critical findings
- **Changes** — change history scoped by file, module, or date range
- **Review** — drift detection: recent changes vs architecture baseline

Signals are ranked by priority and relevance, then truncated to fit the requested token budget.

---

## Configuration

Prism reads `prism.config.yaml` from the project root, with environment variable overrides following the `PRISM_<SECTION>_<KEY>` pattern.

```yaml
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
  maxFileSizeBytes: 1048576       # 1MB

semantic:
  enabled: true
  model: "claude-haiku-4-5-20251001"
  embeddingProvider: "voyage"     # or "openai" or "azure-openai"
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

---

## Database Schema

All tables use the `prism_` prefix. PostgreSQL with pgvector extension.

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   projects   │────<│    files     │────<│     symbols      │
│              │     │              │     │                  │
│ id           │     │ id           │     │ id               │
│ name         │     │ project_id   │     │ file_id          │
│ path (UNIQ)  │     │ path         │     │ project_id       │
│ language     │     │ language     │     │ kind             │
│ total_files  │     │ size_bytes   │     │ name             │
│ total_symbols│     │ line_count   │     │ start/end_line   │
│ index_status │     │ content_hash │     │ exported         │
│ last_commit  │     │ complexity   │     │ signature        │
│ settings     │     │ coupling     │     │ docstring        │
│              │     │ cohesion     │     │ complexity       │
│              │     │ is_doc/test/ │     │                  │
│              │     │   config     │     └──────────────────┘
│              │     │ doc_content  │
│              │     │ metadata     │     ┌──────────────────┐
│              │     │ UNIQ(proj,   │────<│  dependencies    │
│              │     │       path)  │     │                  │
│              │     └──────────────┘     │ source_file_id   │
│              │                          │ target_file_id   │
│              │     ┌──────────────┐     │ source_symbol_id │
│              │────<│  summaries   │     │ target_symbol_id │
│              │     │              │     │ kind             │
│              │     │ level        │     └──────────────────┘
│              │     │ target_id    │
│              │     │ content      │     ┌──────────────────┐
│              │     │ model        │────<│   embeddings     │
│              │     │ input_hash   │     │                  │
│              │     │ cost_usd     │     │ summary_id       │
│              │     └──────────────┘     │ embedding v(1536)│
│              │                          │ model            │
│              │     ┌──────────────┐     │ HNSW index       │
│              │────<│   findings   │     └──────────────────┘
│              │     │              │
│              │     │ category     │     ┌──────────────────┐
│              │     │ severity     │────<│   blueprints     │
│              │     │ title        │     │                  │
│              │     │ description  │     │ title            │
│              │     │ evidence     │     │ subsystem        │
│              │     │ suggestion   │     │ summary          │
│              │     └──────────────┘     │ architecture     │
│              │                          │ module_changes   │
│              │     ┌──────────────┐     │ migration_path   │
│              │────<│  index_runs  │     │ risks            │
│              │     │              │     │ rationale        │
│              │     │ layer        │     │ model            │
│              │     │ status       │     │ cost_usd         │
│              │     │ files_proc   │     └──────────────────┘
│              │     │ files_total  │
│              │     │ cost_usd     │     ┌──────────────────┐
│              │     │ duration_ms  │────<│    commits       │
│              │     │ error        │     │                  │
│              │     └──────────────┘     │ sha              │
│              │                          │ author_name      │
│              │     ┌──────────────┐     │ author_email     │
│              │────<│  api_keys    │     │ committed_at     │
│              │     │              │     │ message          │
│              │     │ key_prefix   │     │ metadata (JSONB) │
│              │     │ key_hash     │     └────────┬─────────┘
│              │     │ label        │              │
│              │     │ permissions  │     ┌────────┴─────────┐
│              │     │ last_used_at │     │  commit_files    │
│              │     └──────────────┘     │                  │
│              │                          │ commit_id        │
│              │     ┌──────────────┐     │ file_id          │
│              │────<│reindex_reqs  │     │ change_type      │
│              │     │              │     │ lines_added      │
│              │     │ slug         │     │ lines_removed    │
│              │     │ layers       │     └──────────────────┘
│              │     │ requested_at │
└──────────────┘     └──────────────┘
```

---

## Project Structure

```
prism/
├── packages/
│   ├── core/                         @prism/core — indexing engine
│   │   └── src/
│   │       ├── indexer/
│   │       │   ├── pipeline.ts       Pipeline orchestrator
│   │       │   ├── types.ts          IndexContext, LayerResult, BudgetTracker
│   │       │   ├── structural/       Layer 1: tree-sitter parsing
│   │       │   │   ├── parser.ts     WASM runtime + grammar loading
│   │       │   │   ├── extractor.ts  Symbol extraction from AST
│   │       │   │   ├── graph.ts      Dependency graph builder
│   │       │   │   ├── metrics.ts    Complexity, coupling, cohesion
│   │       │   │   └── languages.ts  Language detection + registry
│   │       │   ├── docs/             Layer 2: documentation parsing
│   │       │   │   ├── readme.ts     README/markdown parsing
│   │       │   │   ├── comments.ts   Inline comment extraction
│   │       │   │   ├── config.ts     Config file detection (60+ patterns)
│   │       │   │   └── intent.ts     Intent layer assembly
│   │       │   ├── semantic/         Layer 3: LLM summaries + embeddings
│   │       │   │   ├── summarizer.ts Claude Haiku summarization
│   │       │   │   ├── embedder.ts   Voyage/OpenAI embedding providers
│   │       │   │   └── chunker.ts    AST-aware code chunking
│   │       │   ├── analysis/         Layer 4: pattern detection
│   │       │   │   ├── rollup.ts     Hierarchical summary rollup
│   │       │   │   ├── patterns.ts   Pattern detection orchestrator
│   │       │   │   ├── gap-analysis.ts  Docs vs code comparison
│   │       │   │   └── detectors/    5 architectural pattern detectors
│   │       │   └── history/          Git history indexing
│   │       │       └── index.ts      Commit parsing, co-change detection
│   │       ├── context/              Context enricher
│   │       │   ├── assembler.ts      Multi-signal context assembly
│   │       │   ├── ranker.ts         Signal ranking + truncation
│   │       │   ├── truncator.ts      Token-budget-aware truncation
│   │       │   ├── formatter.ts      Markdown output formatting
│   │       │   ├── types.ts          Context + signal types
│   │       │   └── signals/          Signal collectors
│   │       │       ├── semantic.ts   Vector search signals
│   │       │       ├── graph.ts      Dependency graph signals
│   │       │       ├── findings.ts   Static analysis signals
│   │       │       ├── history.ts    Change history signals
│   │       │       └── summaries.ts  Summary signals
│   │       ├── db/
│   │       │   ├── schema.ts         13 prism_ tables (Drizzle)
│   │       │   ├── connection.ts     Pool + Drizzle singleton
│   │       │   ├── migrate.ts        Migration runner
│   │       │   └── queries/          CRUD for all tables
│   │       ├── domain/
│   │       │   ├── types.ts          Enums + interfaces
│   │       │   └── config.ts         YAML config loader
│   │       └── logger.ts             Pino singleton
│   │
│   └── app/                          @prism/app — CLI + dashboard
│       └── src/
│           ├── cli/
│           │   ├── index.ts          Commander dispatch
│           │   └── commands/         7 commands
│           ├── dashboard/
│           │   ├── server.ts         Express setup + auth
│           │   ├── routes/           Route handlers (pages, API, MCP)
│           │   ├── views/            HTML-generating view modules
│           │   └── public/           HTMX extensions + D3 graph
│           ├── blueprint/
│           │   ├── generator.ts      Claude Sonnet → proposals
│           │   ├── splitter.ts       Subsystem grouping
│           │   └── types.ts          Blueprint types
│           ├── auth/
│           │   ├── entra.ts          Azure Entra ID OAuth2
│           │   ├── session.ts        Express session
│           │   ├── middleware.ts      Auth guard
│           │   └── api-key.ts        API key auth for REST/MCP
│           └── worker/               Background reindex worker
│
├── prompts/                          LLM prompt templates
│   ├── summarize-function.md
│   ├── summarize-file.md
│   ├── summarize-module.md
│   ├── summarize-system.md
│   ├── gap-analysis.md
│   └── blueprint.md
│
├── drizzle/                          Database migrations
├── prism.config.yaml                 Default configuration
├── .env.example                      Environment variable template
└── vitest.config.ts                  Test configuration
```

---

## Development

```bash
npm run build         # Build all packages (tsc)
npm test              # Run tests (vitest)
npm run test:watch    # Watch mode
npm run lint          # Type-check without emitting
```

---

## License

Proprietary. All rights reserved.
