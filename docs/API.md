# Prism API Reference

Base URL: `http://localhost:3100` (default)

## Authentication

All API endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens are managed via the dashboard under **API Keys**, or by setting the `PRISM_API_KEY` environment variable (legacy fallback, grants all permissions).

### Permissions

Each API key has one or more permissions:

| Permission   | Grants access to                          |
|--------------|-------------------------------------------|
| `read`       | Search, findings, context, graph, status  |
| `index`      | Trigger reindex                           |
| `register`   | Register/delete projects                  |

---

## Projects

Projects are identified by slug in `owner/repo` format (e.g. `esbenwiberg/prism`).

### Search codebase

Semantic search across indexed code and module summaries.

```
POST /api/projects/:owner/:repo/search
```

**Permission:** `read`

**Request body:**

```json
{
  "query": "how does authentication work",
  "maxResults": 20,
  "maxSummaries": 30
}
```

| Field          | Type     | Required | Default | Description                              |
|----------------|----------|----------|---------|------------------------------------------|
| `query`        | `string` | yes      |         | Natural language search query            |
| `maxResults`   | `number` | no       | `20`    | Max code-level results                   |
| `maxSummaries` | `number` | no       | `30`    | Max module-level summary results         |

**Response `200`:**

```json
{
  "relevantCode": [
    {
      "targetId": "src/auth/session.ts:createSession:function",
      "filePath": "src/auth/session.ts",
      "symbolName": "createSession",
      "symbolKind": "function",
      "level": "function",
      "summary": "Creates an authenticated session...",
      "score": 0.87
    }
  ],
  "moduleSummaries": [
    {
      "targetId": "module:src/auth",
      "content": "Authentication module handling OAuth and session management..."
    }
  ]
}
```

---

### Get findings

Static analysis findings (code smells, patterns, issues).

```
GET /api/projects/:owner/:repo/findings
```

**Permission:** `read`

**Query parameters:**

| Param      | Type     | Default                        | Description                                    |
|------------|----------|--------------------------------|------------------------------------------------|
| `severity` | `string` | `critical,high,medium`         | Comma-separated severity filter                |
| `limit`    | `number` | `50`                           | Max results (capped at 200)                    |

**Response `200`:**

```json
{
  "findings": [
    {
      "category": "complexity",
      "severity": "high",
      "title": "God class detected",
      "description": "Pipeline.ts has 1400 lines and 25 methods...",
      "suggestion": "Extract structural layer into its own module"
    }
  ]
}
```

---

### Trigger reindex

Enqueue a reindex job. The worker picks it up asynchronously.

```
POST /api/projects/:owner/:repo/reindex
```

**Permission:** `index`

**Request body:**

```json
{
  "layers": ["structural", "semantic"]
}
```

| Field    | Type       | Required | Default          | Description                                            |
|----------|------------|----------|------------------|--------------------------------------------------------|
| `layers` | `string[]` | no       | `["structural"]` | Layers to reindex. Valid: `structural`, `semantic`, `history` |

**Response `202`:**

```json
{
  "queued": true
}
```

---

### Delete project

Delete a project and all its indexed data. Irreversible.

```
DELETE /api/projects/:owner/:repo
```

**Permission:** `register`

**Response `200`:**

```json
{
  "deleted": true
}
```

---

## Context Enrichers

Rich, pre-assembled context designed to be injected into LLM prompts. Each endpoint returns structured sections with token counts.

### Task context (enrichment) — recommended entry point

One-shot endpoint that assembles everything an agent needs to start a task: architecture overview, relevant files with summaries, dependencies, blast radius, findings, and recent changes — all scoped to a natural language query. Prism allocates the token budget across signals automatically using its priority system.

```
POST /api/projects/:owner/:repo/context/enrich
```

**Permission:** `read`

**Request body:**

```json
{
  "query": "add retry mechanism to LLM calls in the indexer",
  "maxTokens": 16000
}
```

| Field       | Type     | Required | Default  | Description                                      |
|-------------|----------|----------|----------|--------------------------------------------------|
| `query`     | `string` | yes      |          | Natural language description of the task         |
| `maxTokens` | `number` | no       | `16000`  | Token budget — priority system allocates it      |

**Response `200`:**

```json
{
  "sections": [
    {
      "heading": "Purpose",
      "priority": 1,
      "content": "Prism is a standalone codebase analysis tool...",
      "tokenCount": 120
    },
    {
      "heading": "Relevant Code",
      "priority": 2,
      "content": "**src/indexer/pipeline.ts** — `runPipeline` (function)\nOrchestrates the five-layer indexing pipeline...",
      "tokenCount": 850
    },
    {
      "heading": "File Summaries",
      "priority": 2,
      "content": "**src/indexer/pipeline.ts**\nMain indexing pipeline orchestrator...",
      "tokenCount": 340
    },
    {
      "heading": "Blast Radius — src/indexer/pipeline.ts",
      "priority": 3,
      "content": "**src/worker/executor.ts** (depth 1)...",
      "tokenCount": 210
    }
  ],
  "totalTokens": 4520,
  "truncated": false
}
```

High-priority sections survive even with small token budgets.

**Graceful degradation:** If no semantic layer is indexed yet, returns architecture + critical findings. Never returns empty.

---

### File context

Summary, blast radius, dependencies, exported symbols, and findings for a single file.

```
POST /api/projects/:owner/:repo/context/file
```

**Permission:** `read`

**Request body:**

```json
{
  "filePath": "src/indexer/pipeline.ts",
  "intent": "add retry mechanism to LLM calls",
  "maxTokens": 4000
}
```

| Field       | Type     | Required | Default | Description                                         |
|-------------|----------|----------|---------|-----------------------------------------------------|
| `filePath`  | `string` | yes      |         | Project-relative file path                          |
| `intent`    | `string` | no       |         | What you plan to do — boosts relevant context       |
| `maxTokens` | `number` | no       | `4000`  | Token budget for response                           |

**Response `200`:** Context object with sections (summary, blast radius, dependencies, symbols, findings) and token metadata.

---

### Module context

Module role, file list, external dependencies, public API, and findings.

```
POST /api/projects/:owner/:repo/context/module
```

**Permission:** `read`

**Request body:**

```json
{
  "modulePath": "src/db/queries",
  "maxTokens": 3000
}
```

| Field        | Type     | Required | Default | Description                     |
|--------------|----------|----------|---------|---------------------------------|
| `modulePath` | `string` | yes      |         | Module directory path           |
| `maxTokens`  | `number` | no       | `3000`  | Token budget for response       |

**Response `200`:** Context object with module-level sections and token metadata.

---

### Related files

Find files related to a query via semantic similarity and the dependency graph.

```
POST /api/projects/:owner/:repo/context/related
```

**Permission:** `read`

**Request body:**

```json
{
  "query": "database connection pooling",
  "maxResults": 15,
  "includeTests": false
}
```

| Field          | Type      | Required | Default | Description                                |
|----------------|-----------|----------|---------|--------------------------------------------|
| `query`        | `string`  | yes      |         | Natural language query or file path        |
| `maxResults`   | `number`  | no       | `15`    | Max files to return                        |
| `includeTests` | `boolean` | no       | `false` | Include test files                         |

**Response `200`:**

```json
{
  "results": [
    {
      "path": "src/db/connection.ts",
      "score": 0.92,
      "relationship": "semantic",
      "summary": "Database connection pool management..."
    }
  ]
}
```

---

### Architecture overview

System purpose, module map, inter-module dependencies, and critical findings.

```
POST /api/projects/:owner/:repo/context/arch
```

**Permission:** `read`

**Request body:**

```json
{
  "maxTokens": 5000
}
```

| Field       | Type     | Required | Default | Description               |
|-------------|----------|----------|---------|---------------------------|
| `maxTokens` | `number` | no       | `5000`  | Token budget for response |

**Response `200`:** Context object with architecture sections and token metadata.

---

### Change context

Recent commits, change frequency, co-change patterns, and author distribution. Scope by file, module, or date range.

```
POST /api/projects/:owner/:repo/context/changes
```

**Permission:** `read`

**Request body:**

```json
{
  "filePath": "src/indexer/pipeline.ts",
  "since": "2026-03-01",
  "until": "2026-03-17",
  "maxCommits": 20
}
```

| Field        | Type     | Required | Default | Description                           |
|--------------|----------|----------|---------|---------------------------------------|
| `filePath`   | `string` | no       |         | Scope to a specific file              |
| `modulePath` | `string` | no       |         | Scope to a module/directory           |
| `since`      | `string` | no       |         | Start date (ISO format)               |
| `until`      | `string` | no       | now     | End date (ISO format)                 |
| `maxCommits` | `number` | no       | `20`    | Maximum commits to include            |
| `maxTokens`  | `number` | no       |         | Token budget for response             |

**Response `200`:** Context object with change history sections and token metadata.

---

### Review context

Architecture drift detection, redundancy analysis, regressions, and hotspots for a time range.

```
POST /api/projects/:owner/:repo/context/review
```

**Permission:** `read`

**Request body:**

```json
{
  "since": "2026-03-10",
  "until": "2026-03-17",
  "maxTokens": 8000
}
```

| Field       | Type     | Required | Default | Description                      |
|-------------|----------|----------|---------|----------------------------------|
| `since`     | `string` | yes      |         | Start date (ISO format)          |
| `until`     | `string` | no       | now     | End date (ISO format)            |
| `maxTokens` | `number` | no       | `8000`  | Token budget for response        |

**Response `200`:** Context object with review sections (change summary, hotspots, drift findings, co-change clusters, architecture baseline) and token metadata.

---

## Dependency Graph

### Get graph data

Returns the file dependency graph for D3 visualization.

```
GET /api/projects/:id/graph
```

**Auth:** Session (dashboard) — no Bearer token required.

**Response `200`:**

```json
{
  "nodes": [
    {
      "id": 42,
      "path": "src/db/connection.ts",
      "module": "src",
      "complexity": 12.5,
      "lineCount": 85
    }
  ],
  "edges": [
    {
      "source": 42,
      "target": 17
    }
  ]
}
```

---

## MCP Server

Prism exposes the same tools via [Model Context Protocol](https://modelcontextprotocol.io) for direct integration with Claude Code and other MCP-compatible clients.

```
POST /mcp
```

**Auth:** Bearer token (same as REST API).

**Transport:** StreamableHTTP (stateless). `GET` and `DELETE` return `405`.

### Available tools

| Tool                       | Permission   | Description                                                                                     |
|----------------------------|--------------|-------------------------------------------------------------------------------------------------|
| `search_codebase`          | `read`       | Semantic search — find relevant code and module summaries by natural language query              |
| `get_project_status`       | `read`       | Index status, file count, last index time, active job status                                    |
| `get_file_context`         | `read`       | File-level context: summary, blast radius, dependencies, exported symbols, findings             |
| `get_module_context`       | `read`       | Module overview: role, files, external dependencies, public API, findings                       |
| `get_related_files`        | `read`       | Find related files via semantic similarity and dependency graph, ranked by relevance             |
| `get_architecture_overview`| `read`       | System architecture: purpose, module map, inter-module dependencies, critical findings          |
| `get_change_context`       | `read`       | Recent commits, change frequency, co-change patterns, author distribution                       |
| `get_review_context`       | `read`       | Architecture drift, redundancy, regressions, and hotspots for a time range                      |
| `enrich_task_context`      | `read`       | One-shot task context: architecture, relevant code, file summaries, blast radius, findings, changes |
| `register_project`         | `register`   | Register a new project for indexing                                                             |
| `delete_project`           | `register`   | Delete a project and all its data (irreversible)                                                |
| `trigger_reindex`          | `index`      | Enqueue a reindex job for specified layers                                                      |

All project-scoped tools take a `slug` parameter (`owner/repo` format).

### MCP tool parameters

Tool parameters mirror the REST API request bodies. See each context enricher endpoint above for the full parameter reference. The `slug` field replaces the `:owner/:repo` URL segments.

---

## Error responses

All endpoints return errors in a consistent format:

```json
{
  "error": "Description of what went wrong"
}
```

| Status | Meaning                                    |
|--------|--------------------------------------------|
| `400`  | Invalid request (missing/malformed params) |
| `401`  | Missing or invalid API key                 |
| `403`  | API key lacks required permission          |
| `404`  | Project not found or not yet indexed       |
| `500`  | Internal server error                      |
