# Prism Context Enricher — Design Plan

## Context

Prism already deeply indexes codebases through a 5-layer pipeline and stores rich structured data (symbols, dependencies, summaries, embeddings, findings). But the current MCP surface is too blunt — `search_codebase` runs a single semantic search and dumps everything without understanding **what the agent is actually trying to do**.

Inspired by Augment Code's Context Engine, this plan extends Prism into a **context enricher** — a system that serves curated, multi-signal, token-budget-aware context to AI agents via new MCP tools and REST endpoints.

Key design decisions:
- **No LLM in the retrieval path** — all intelligence is at index time. Context assembly is pure data retrieval + ranking + formatting. Fast and free per query.
- **Scheduled reindexing is fine** — no event-driven/incremental reindexing for now.
- **Single-repo focus** — no cross-repo support yet.
- **Drift review as a first-class use case** — agents can periodically review recent commits against Prism's analysis data to catch architecture drift, redundancy, and regressions.

---

## Phase 1: Context Assembly Layer + Core MCP Tools

*No schema changes. Builds on existing data.*

### 1.1 New module: `packages/core/src/context/`

```
packages/core/src/context/
  index.ts              — barrel export
  types.ts              — ContextRequest, ContextSection, ContextResponse
  assembler.ts          — orchestrator: fans out to signal collectors, ranks, truncates
  signals/
    semantic.ts         — wraps similaritySearch with query embedding
    graph.ts            — dependency graph traversal (BFS, depth-limited)
    summaries.ts        — fetches summaries at right granularity for scope
    findings.ts         — filters findings by file/module scope
  ranker.ts             — composite scoring (semantic + graph + summary level)
  truncator.ts          — token-budget-aware truncation (chars/4 heuristic)
  formatter.ts          — renders assembled context as markdown
```

**Core types:**

```typescript
interface ContextRequest {
  projectId: number;
  type: 'file' | 'module' | 'related' | 'architecture';
  target: string;           // file path, module path, or query
  intent?: string;          // "add a retry mechanism" — boosts relevant signals
  maxTokens: number;        // token budget for response
  options: Record<string, unknown>;
}

interface ContextSection {
  heading: string;
  priority: number;         // 1=must include, 5=nice to have
  content: string;
  tokenCount: number;
}

interface ContextResponse {
  sections: ContextSection[];
  totalTokens: number;
  truncated: boolean;
}
```

**Assembly algorithm (shared by all tools):**

1. **Fan-out** — dispatch to signal collectors in parallel based on request type
2. **Score** — composite relevance per signal:
   - Base relevance from collector (semantic distance, graph distance)
   - Boost for signals matching `intent` (if provided)
   - Boost for correct granularity (file-level for file context, etc.)
   - Penalize test files unless explicitly requested
3. **Group into sections** — each section has a priority (1-5)
4. **Budget allocation** — priority 1 sections get full allocation, lower priorities split remainder
5. **Truncate** — within sections, sort by relevance, cut to fit budget
6. **Format** — render as markdown

### 1.2 New query functions

**`packages/core/src/db/queries/dependencies.ts`** — add:
```typescript
getDependenciesByTargetFileId(targetFileId: number): Promise<DependencyRow[]>
```
(Reverse lookup — "who imports me?" — critical for blast radius)

**`packages/core/src/db/queries/files.ts`** — add:
```typescript
getFilesByDirectory(projectId: number, dirPrefix: string): Promise<FileRow[]>
```

**`packages/core/src/db/queries/symbols.ts`** — add:
```typescript
getExportedSymbolsByFileId(fileId: number): Promise<SymbolRow[]>
```

Findings filtered by searching `evidence` JSONB for file path matches (`evidence::text LIKE '%<path>%'`). No migration needed.

### 1.3 New MCP tools (4 tools)

#### `get_file_context` — "I'm about to modify this file. What do I need to know?"

```
input: { slug, filePath, intent?, maxTokens? (default 4000) }
```

Sections (by priority):
1. **File summary** + module context (where this file fits in the system)
2. **Blast radius** — files that depend on this file (reverse deps), with their summaries
3. **Dependencies** — what this file imports, with summaries
4. **Symbols** — exported symbols with signatures
5. **Findings** — architectural issues scoped to this file
6. **Intent-matched results** — if intent provided, semantic search for extra relevant hits

Assembly: `getFileByPath` → `getSummaryByTargetId("file:..." + "module:...")` → `getDependenciesBySourceFileId` + `getDependenciesByTargetFileId` → `getSymbolsByFileId` → findings filter → optional `similaritySearch` with intent → assemble + truncate.

#### `get_module_context` — "Explain this module's role and architecture."

```
input: { slug, modulePath, maxTokens? (default 3000) }
```

Sections:
1. **Module summary** + system-level context
2. **Files** — all files in module with one-line summaries and metrics
3. **External deps** — dependencies crossing module boundary
4. **Key exports** — public API symbols
5. **Findings** — issues scoped to this module

#### `get_related_files` — "What files are related to this?"

```
input: { slug, query, maxResults? (default 15), includeTests? (default false) }
```

Output: Ranked file list with path, score, brief summary, relationship type.

Assembly: semantic search (embed query → cosine) + graph traversal (BFS depth 2 if query is a file path). Merge with composite score: `0.6 * semantic + 0.4 * graph_proximity`. Files in both sets get boosted.

#### `get_architecture_overview` — "What's the high-level architecture?"

```
input: { slug, maxTokens? (default 5000) }
```

Sections:
1. **Purpose document** (from purpose-level summary)
2. **System summary** (from system-level summary)
3. **Module map** — all modules with one-line descriptions
4. **Inter-module dependencies** — simplified directed graph
5. **Critical findings** — severity critical/high only

### 1.4 REST endpoints (mirror MCP tools, same assembly layer)

```
POST /api/projects/:owner/:repo/context/file     — get_file_context
POST /api/projects/:owner/:repo/context/module    — get_module_context
POST /api/projects/:owner/:repo/context/related   — get_related_files
POST /api/projects/:owner/:repo/context/arch      — get_architecture_overview
```

### 1.5 Files to modify

| File | Change |
|------|--------|
| `packages/core/src/context/*` | **New** — entire context module |
| `packages/core/src/db/queries/dependencies.ts` | Add `getDependenciesByTargetFileId` |
| `packages/core/src/db/queries/files.ts` | Add `getFilesByDirectory` |
| `packages/core/src/db/queries/symbols.ts` | Add `getExportedSymbolsByFileId` |
| `packages/core/src/index.ts` | Export new context module |
| `packages/app/src/dashboard/routes/mcp.ts` | Register 4 new MCP tools |
| `packages/app/src/dashboard/routes/api.ts` | Add 4 new REST endpoints |

---

## Phase 2: Git History + Drift Review

### 2.1 New DB tables (migration)

```sql
CREATE TABLE prism_commits (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES prism_projects(id) ON DELETE CASCADE,
  sha TEXT NOT NULL,
  author_name TEXT,
  author_email TEXT,
  committed_at TIMESTAMPTZ,
  message TEXT NOT NULL,
  metadata JSONB,  -- PR number, ticket refs, tags
  UNIQUE(project_id, sha)
);

CREATE TABLE prism_commit_files (
  id SERIAL PRIMARY KEY,
  commit_id INTEGER NOT NULL REFERENCES prism_commits(id) ON DELETE CASCADE,
  file_id INTEGER REFERENCES prism_files(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  change_type TEXT NOT NULL,  -- 'add', 'modify', 'delete', 'rename'
  lines_added INTEGER,
  lines_removed INTEGER
);

CREATE INDEX idx_commit_files_file_id ON prism_commit_files(file_id);
CREATE INDEX idx_commits_project_time ON prism_commits(project_id, committed_at DESC);
```

Add columns to `prism_files`:
```sql
ALTER TABLE prism_files ADD COLUMN change_frequency INTEGER DEFAULT 0;
ALTER TABLE prism_files ADD COLUMN last_changed_at TIMESTAMPTZ;
```

### 2.2 New indexing layer: "history"

New: `packages/core/src/indexer/history/index.ts`

1. Runs `git log --format=<format> --numstat` on clone (with configurable depth, `CloneOptions.depth` already supports this)
2. Parses commits + per-file change stats
3. Extracts PR refs, ticket numbers from commit messages
4. Computes per-file change frequency
5. Detects **co-change patterns** (files modified in same commit)
6. Persists to `prism_commits` + `prism_commit_files`
7. Updates `change_frequency` and `last_changed_at` on `prism_files`

Default clone depth bumped to 50 when history layer requested.

### 2.3 New query functions

```
packages/core/src/db/queries/commits.ts (NEW)
  getRecentCommitsByFileId(fileId, limit)
  getRecentCommitsByProjectId(projectId, limit)
  getRecentCommitsByDateRange(projectId, since, until)
  getCommitFilesByCommitId(commitId)
  getCoChangedFiles(projectId, fileId, limit)
  getChangeHotspots(projectId, limit)
  getCommitsWithFileDetails(projectId, since, until)  — joins commits + commit_files
```

### 2.4 New MCP tools (2 tools)

#### `get_change_context` — "What changed recently and why?"

```
input: { slug, filePath?, modulePath?, since?, until?, maxCommits? (default 20) }
```

Sections:
1. Recent commits with messages (scoped to file/module if provided)
2. Change frequency / hotspot indicator
3. Co-change patterns (files that frequently change together)
4. Author distribution

#### `get_review_context` — "Review recent changes for drift, redundancy, and regressions."

This is the periodic drift review tool. An agent calls this weekly/monthly and gets everything it needs to assess whether recent changes align with the architecture.

```
input: {
  slug,
  since: string,       // ISO date, e.g. "2026-03-10"
  until?: string,      // ISO date, defaults to now
  maxTokens? (default 8000)
}
```

Sections (by priority):
1. **Change summary** — N commits, M files changed, top authors
2. **Changed files with context** — for each changed file: path, change type, file summary, module context, and any findings that apply to it
3. **Hotspots** — files with high change frequency in this period (potential instability)
4. **New/worsened findings** — findings whose evidence references any changed files (drift indicators)
5. **Co-change clusters** — groups of files that changed together repeatedly (potential coupling)
6. **Architecture alignment** — system summary + purpose doc as baseline for the agent to compare against

**How an agent uses this:**
The agent gets this rich context blob and can reason about:
- "File X was modified 8 times this month and has a god-module finding → refactoring candidate"
- "These 5 commits all added similar error handling in different services → redundancy"
- "This change introduced a circular dependency between modules A and B → drift"
- "The gap analysis says auth should use middleware, but 3 recent commits added inline auth checks → drift from intended architecture"

The agent does the reasoning. Prism provides the structured evidence.

### 2.5 Wire history signals into Phase 1 tools

- `get_file_context`: add change frequency + co-changed files as priority 4 section
- `get_related_files`: co-change patterns boost relevance scores
- `get_architecture_overview`: add hotspot summary as priority 5 section

### 2.6 REST endpoints

```
POST /api/projects/:owner/:repo/context/changes   — get_change_context
POST /api/projects/:owner/:repo/context/review     — get_review_context
```

### 2.7 Files to modify

| File | Change |
|------|--------|
| `packages/core/src/db/schema.ts` | Add commits + commit_files tables, file columns |
| `drizzle/00XX_add_git_history.sql` | **New** — migration |
| `packages/core/src/indexer/history/*` | **New** — history indexer |
| `packages/core/src/db/queries/commits.ts` | **New** — commit queries |
| `packages/core/src/indexer/pipeline.ts` | Register history layer |
| `packages/core/src/context/signals/history.ts` | **New** — history signal collector |
| `packages/app/src/dashboard/routes/mcp.ts` | Add 2 new tools, update `trigger_reindex` valid layers |
| `packages/app/src/dashboard/routes/api.ts` | Add 2 new REST endpoints |

---

## Verification

### Phase 1
- `npm run build` — compiles cleanly
- `npm test` — existing tests pass
- New unit tests for:
  - Context assembler (mock DB, verify ranking + section priority + truncation)
  - Graph traversal (BFS with depth limits)
  - Truncator (respects token budgets)
  - Ranker (composite scoring)
- Manual: call `get_file_context` via MCP for a real indexed project → verify file summary + blast radius + deps + findings
- Manual: call `get_architecture_overview` → verify purpose doc + module map + findings

### Phase 2
- Unit tests for git log parser
- Unit tests for co-change detection
- Integration: index with history layer → verify `prism_commits` populated
- Manual: call `get_review_context` with a date range → verify commits + changed files + findings + hotspots
- Manual: agent workflow — call `get_review_context`, let agent reason about drift
