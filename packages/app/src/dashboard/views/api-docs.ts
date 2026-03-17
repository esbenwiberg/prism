/**
 * API Documentation page — reference for the REST API and MCP tools.
 */

import { layout } from "./layout.js";
import { card } from "./components.js";

/** Inline code styling helper. */
const code = (text: string) =>
  `<code class="font-mono text-xs bg-slate-700 px-1 py-0.5 rounded">${text}</code>`;

/** Parameter table row helper. */
const param = (name: string, type: string, required: boolean, def: string, desc: string) =>
  `<tr class="border-b border-slate-700/50">
    <td class="py-1.5 pr-3 font-mono text-xs text-purple-400">${name}</td>
    <td class="py-1.5 pr-3 text-xs text-slate-400">${type}</td>
    <td class="py-1.5 pr-3 text-xs text-slate-500">${required ? "yes" : "no"}</td>
    <td class="py-1.5 pr-3 text-xs text-slate-500 font-mono">${def}</td>
    <td class="py-1.5 text-xs text-slate-400">${desc}</td>
  </tr>`;

/** Table header for parameter tables. */
const paramHeader = `<thead><tr class="text-left text-xs text-slate-500 border-b border-slate-700">
  <th class="py-1.5 pr-3 font-medium">Param</th>
  <th class="py-1.5 pr-3 font-medium">Type</th>
  <th class="py-1.5 pr-3 font-medium">Req</th>
  <th class="py-1.5 pr-3 font-medium">Default</th>
  <th class="py-1.5 font-medium">Description</th>
</tr></thead>`;

/** HTTP method badge. */
const method = (m: string) => {
  const colors: Record<string, string> = {
    GET: "bg-green-500/20 text-green-400",
    POST: "bg-blue-500/20 text-blue-400",
    DELETE: "bg-red-500/20 text-red-400",
  };
  return `<span class="font-mono text-xs font-bold px-2 py-0.5 rounded ${colors[m] ?? "bg-slate-700 text-slate-300"}">${m}</span>`;
};

/** Endpoint header. */
const endpoint = (m: string, path: string, permission: string) =>
  `<div class="flex items-center gap-3 mb-3">
    ${method(m)}
    <span class="font-mono text-sm text-slate-200">${path}</span>
    <span class="text-xs text-slate-500 ml-auto">Permission: ${code(permission)}</span>
  </div>`;

/** JSON code block. */
const json = (content: string) =>
  `<pre class="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto mt-2 mb-3">${content}</pre>`;

/** Param table wrapper. */
const paramTable = (rows: string) =>
  `<table class="w-full mt-2 mb-3">${paramHeader}<tbody>${rows}</tbody></table>`;

export function apiDocsFragment(): string {
  return buildContent();
}

export function apiDocsPage(userName: string): string {
  return layout({
    title: "API Reference",
    content: buildContent(),
    userName,
    activeNav: "api-docs",
  });
}

function buildContent(): string {
  return `
<h2 class="text-2xl font-bold text-slate-50 mb-2">API Reference</h2>
<p class="text-slate-400 mb-6 max-w-3xl">REST API and MCP tool reference for machine-to-machine integration. All endpoints require a Bearer token in the ${code("Authorization")} header.</p>

<div class="flex gap-2 mb-8 flex-wrap">
  <span class="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">Base URL: ${code("http://localhost:3100")}</span>
  <span class="text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700">Auth: ${code("Bearer &lt;token&gt;")}</span>
  <a href="/api-keys" class="text-xs px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20">Manage API Keys &rarr;</a>
</div>

<!-- Permissions -->
${card("Permissions", `
  <p class="text-sm text-slate-400 mb-3">Each API key has one or more permissions that control which endpoints it can access:</p>
  <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
    <div class="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/50">
      <span class="text-green-400 text-xs font-mono font-bold">read</span>
      <p class="text-xs text-slate-400 mt-1">Search, findings, context enrichers, graph, status</p>
    </div>
    <div class="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/50">
      <span class="text-blue-400 text-xs font-mono font-bold">index</span>
      <p class="text-xs text-slate-400 mt-1">Trigger reindex jobs</p>
    </div>
    <div class="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/50">
      <span class="text-orange-400 text-xs font-mono font-bold">register</span>
      <p class="text-xs text-slate-400 mt-1">Register and delete projects</p>
    </div>
  </div>
`)}

<!-- Search -->
${card("Search codebase", `
  <p class="text-sm text-slate-400 mb-3">Semantic search across indexed code and module summaries.</p>
  ${endpoint("POST", "/api/projects/:owner/:repo/search", "read")}
  ${paramTable(
    param("query", "string", true, "", "Natural language search query") +
    param("maxResults", "number", false, "20", "Max code-level results") +
    param("maxSummaries", "number", false, "30", "Max module summary results")
  )}
  <p class="text-xs text-slate-500 mb-1">Response:</p>
  ${json(`{
  "relevantCode": [{
    "targetId": "src/auth/session.ts:createSession:function",
    "filePath": "src/auth/session.ts",
    "symbolName": "createSession",
    "symbolKind": "function",
    "level": "function",
    "summary": "Creates an authenticated session...",
    "score": 0.87
  }],
  "moduleSummaries": [{
    "targetId": "module:src/auth",
    "content": "Authentication module..."
  }]
}`)}
`)}

<!-- Findings -->
${card("Get findings", `
  <p class="text-sm text-slate-400 mb-3">Static analysis findings (code smells, patterns, issues).</p>
  ${endpoint("GET", "/api/projects/:owner/:repo/findings", "read")}
  <p class="text-xs text-slate-500 mb-1">Query parameters:</p>
  ${paramTable(
    param("severity", "string", false, "critical,high,medium", "Comma-separated severity filter") +
    param("limit", "number", false, "50", "Max results (capped at 200)")
  )}
  <p class="text-xs text-slate-500 mb-1">Response:</p>
  ${json(`{
  "findings": [{
    "category": "complexity",
    "severity": "high",
    "title": "God class detected",
    "description": "Pipeline.ts has 1400 lines...",
    "suggestion": "Extract structural layer into its own module"
  }]
}`)}
`)}

<!-- Reindex -->
${card("Trigger reindex", `
  <p class="text-sm text-slate-400 mb-3">Enqueue a reindex job. The worker picks it up asynchronously.</p>
  ${endpoint("POST", "/api/projects/:owner/:repo/reindex", "index")}
  ${paramTable(
    param("layers", "string[]", false, '["structural"]', 'Layers to reindex: structural, semantic, history')
  )}
  <p class="text-xs text-slate-500 mb-1">Response ${code("202")}:</p>
  ${json(`{ "queued": true }`)}
`)}

<!-- Delete -->
${card("Delete project", `
  <p class="text-sm text-slate-400 mb-3">Delete a project and all its indexed data. Irreversible.</p>
  ${endpoint("DELETE", "/api/projects/:owner/:repo", "register")}
  <p class="text-xs text-slate-500 mb-1">Response:</p>
  ${json(`{ "deleted": true }`)}
`)}

<h3 class="text-lg font-bold text-slate-50 mt-8 mb-4">Context Enrichers</h3>
<p class="text-slate-400 mb-6 text-sm max-w-3xl">Rich, pre-assembled context designed to be injected into LLM prompts. Each endpoint returns structured sections with token counts.</p>

<!-- Task Context (Enrich) -->
${card("Task context (enrichment)", `
  <p class="text-sm text-slate-400 mb-1">⭐ <strong class="text-slate-200">Recommended entry point.</strong> One-shot endpoint that assembles everything an agent needs for a task.</p>
  <p class="text-sm text-slate-400 mb-3">Architecture overview, relevant files with summaries, dependencies, blast radius, findings, and recent changes — all scoped to a natural language query. Prism allocates the token budget automatically via its priority system.</p>
  ${endpoint("POST", "/api/projects/:owner/:repo/context/enrich", "read")}
  ${paramTable(
    param("query", "string", true, "", "Natural language description of the task") +
    param("maxTokens", "number", false, "16000", "Token budget — priority system allocates it")
  )}
  <p class="text-xs text-slate-500 mb-1">Response:</p>
  ${json(`{
  "sections": [
    { "heading": "Purpose", "priority": 1, "content": "Prism is a standalone...", "tokenCount": 120 },
    { "heading": "Relevant Code", "priority": 2, "content": "**src/indexer/pipeline.ts** — ...", "tokenCount": 850 },
    { "heading": "File Summaries", "priority": 2, "content": "**src/indexer/pipeline.ts**\\n...", "tokenCount": 340 },
    { "heading": "Blast Radius — src/indexer/pipeline.ts", "priority": 3, "content": "...", "tokenCount": 210 }
  ],
  "totalTokens": 4520,
  "truncated": false
}`)}
  <p class="text-xs text-slate-500 mt-2">Graceful degradation: returns architecture + findings even if semantic layer isn't indexed yet.</p>
`)}

<!-- File Context -->
${card("File context", `
  <p class="text-sm text-slate-400 mb-3">Summary, blast radius, dependencies, exported symbols, and findings for a file.</p>
  ${endpoint("POST", "/api/projects/:owner/:repo/context/file", "read")}
  ${paramTable(
    param("filePath", "string", true, "", "Project-relative file path") +
    param("intent", "string", false, "", "What you plan to do — boosts relevant context") +
    param("maxTokens", "number", false, "4000", "Token budget for response")
  )}
`)}

<!-- Module Context -->
${card("Module context", `
  <p class="text-sm text-slate-400 mb-3">Module role, file list, external dependencies, public API, and findings.</p>
  ${endpoint("POST", "/api/projects/:owner/:repo/context/module", "read")}
  ${paramTable(
    param("modulePath", "string", true, "", "Module directory path (e.g. src/db/queries)") +
    param("maxTokens", "number", false, "3000", "Token budget for response")
  )}
`)}

<!-- Related Files -->
${card("Related files", `
  <p class="text-sm text-slate-400 mb-3">Find files related to a query via semantic similarity and the dependency graph.</p>
  ${endpoint("POST", "/api/projects/:owner/:repo/context/related", "read")}
  ${paramTable(
    param("query", "string", true, "", "Natural language query or file path") +
    param("maxResults", "number", false, "15", "Max files to return") +
    param("includeTests", "boolean", false, "false", "Include test files in results")
  )}
  <p class="text-xs text-slate-500 mb-1">Response:</p>
  ${json(`{
  "results": [{
    "path": "src/db/connection.ts",
    "score": 0.92,
    "relationship": "semantic",
    "summary": "Database connection pool management..."
  }]
}`)}
`)}

<!-- Architecture -->
${card("Architecture overview", `
  <p class="text-sm text-slate-400 mb-3">System purpose, module map, inter-module dependencies, and critical findings.</p>
  ${endpoint("POST", "/api/projects/:owner/:repo/context/arch", "read")}
  ${paramTable(
    param("maxTokens", "number", false, "5000", "Token budget for response")
  )}
`)}

<!-- Change Context -->
${card("Change context", `
  <p class="text-sm text-slate-400 mb-3">Recent commits, change frequency, co-change patterns, and author distribution. Scope by file, module, or date range.</p>
  ${endpoint("POST", "/api/projects/:owner/:repo/context/changes", "read")}
  ${paramTable(
    param("filePath", "string", false, "", "Scope to a specific file") +
    param("modulePath", "string", false, "", "Scope to a module/directory") +
    param("since", "string", false, "", "Start date (ISO format)") +
    param("until", "string", false, "now", "End date (ISO format)") +
    param("maxCommits", "number", false, "20", "Maximum commits to include") +
    param("maxTokens", "number", false, "", "Token budget for response")
  )}
`)}

<!-- Review Context -->
${card("Review context", `
  <p class="text-sm text-slate-400 mb-3">Architecture drift detection, redundancy analysis, regressions, and hotspots for a time range.</p>
  ${endpoint("POST", "/api/projects/:owner/:repo/context/review", "read")}
  ${paramTable(
    param("since", "string", true, "", "Start date (ISO format)") +
    param("until", "string", false, "now", "End date (ISO format)") +
    param("maxTokens", "number", false, "8000", "Token budget for response")
  )}
`)}

<!-- Graph -->
${card("Dependency graph", `
  <p class="text-sm text-slate-400 mb-3">File dependency graph data for visualization. Uses project ID (not slug).</p>
  ${endpoint("GET", "/api/projects/:id/graph", "session")}
  <p class="text-xs text-slate-500 mb-1">Response:</p>
  ${json(`{
  "nodes": [{ "id": 42, "path": "src/db/connection.ts", "module": "src", "complexity": 12.5, "lineCount": 85 }],
  "edges": [{ "source": 42, "target": 17 }]
}`)}
`)}

<h3 class="text-lg font-bold text-slate-50 mt-8 mb-4">MCP Server</h3>
<p class="text-slate-400 mb-6 text-sm max-w-3xl">The same tools are available via <a href="https://modelcontextprotocol.io" class="text-purple-400 hover:text-purple-300" target="_blank" rel="noopener">Model Context Protocol</a> for direct integration with Claude Code and other MCP clients.</p>

${card("MCP endpoint", `
  ${endpoint("POST", "/mcp", "varies per tool")}
  <p class="text-sm text-slate-400 mb-3">Transport: StreamableHTTP (stateless). ${code("GET")} and ${code("DELETE")} return ${code("405")}.</p>
  <p class="text-sm text-slate-400 mb-3">Tool parameters mirror the REST API request bodies above, with an additional ${code("slug")} field (${code("owner/repo")} format) replacing the URL path segments.</p>
  <div class="overflow-x-auto">
    <table class="w-full mt-2">
      <thead><tr class="text-left text-xs text-slate-500 border-b border-slate-700">
        <th class="py-1.5 pr-3 font-medium">Tool</th>
        <th class="py-1.5 pr-3 font-medium">Permission</th>
        <th class="py-1.5 font-medium">Description</th>
      </tr></thead>
      <tbody>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-3 font-mono text-xs text-purple-400">search_codebase</td><td class="py-1.5 pr-3 text-xs text-green-400">read</td><td class="py-1.5 text-xs text-slate-400">Semantic search across indexed code</td></tr>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-3 font-mono text-xs text-purple-400">get_project_status</td><td class="py-1.5 pr-3 text-xs text-green-400">read</td><td class="py-1.5 text-xs text-slate-400">Index status, file count, active job status</td></tr>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-3 font-mono text-xs text-purple-400">get_file_context</td><td class="py-1.5 pr-3 text-xs text-green-400">read</td><td class="py-1.5 text-xs text-slate-400">File summary, blast radius, deps, symbols, findings</td></tr>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-3 font-mono text-xs text-purple-400">get_module_context</td><td class="py-1.5 pr-3 text-xs text-green-400">read</td><td class="py-1.5 text-xs text-slate-400">Module role, files, external deps, public API</td></tr>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-3 font-mono text-xs text-purple-400">get_related_files</td><td class="py-1.5 pr-3 text-xs text-green-400">read</td><td class="py-1.5 text-xs text-slate-400">Related files via similarity + dependency graph</td></tr>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-3 font-mono text-xs text-purple-400">get_architecture_overview</td><td class="py-1.5 pr-3 text-xs text-green-400">read</td><td class="py-1.5 text-xs text-slate-400">System architecture, module map, critical findings</td></tr>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-3 font-mono text-xs text-purple-400">get_change_context</td><td class="py-1.5 pr-3 text-xs text-green-400">read</td><td class="py-1.5 text-xs text-slate-400">Commits, change frequency, co-change patterns</td></tr>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-3 font-mono text-xs text-purple-400">get_review_context</td><td class="py-1.5 pr-3 text-xs text-green-400">read</td><td class="py-1.5 text-xs text-slate-400">Drift review, regressions, hotspots</td></tr>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-3 font-mono text-xs text-purple-400">enrich_task_context</td><td class="py-1.5 pr-3 text-xs text-green-400">read</td><td class="py-1.5 text-xs text-slate-400">One-shot task context: architecture, code, findings, changes</td></tr>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-3 font-mono text-xs text-purple-400">register_project</td><td class="py-1.5 pr-3 text-xs text-orange-400">register</td><td class="py-1.5 text-xs text-slate-400">Register a new project for indexing</td></tr>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-3 font-mono text-xs text-purple-400">delete_project</td><td class="py-1.5 pr-3 text-xs text-orange-400">register</td><td class="py-1.5 text-xs text-slate-400">Delete a project and all its data</td></tr>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-3 font-mono text-xs text-purple-400">trigger_reindex</td><td class="py-1.5 pr-3 text-xs text-blue-400">index</td><td class="py-1.5 text-xs text-slate-400">Enqueue a reindex job</td></tr>
      </tbody>
    </table>
  </div>
`)}

<!-- Errors -->
${card("Error responses", `
  <p class="text-sm text-slate-400 mb-3">All endpoints return errors in a consistent format:</p>
  ${json(`{ "error": "Description of what went wrong" }`)}
  <div class="overflow-x-auto">
    <table class="w-full mt-2">
      <thead><tr class="text-left text-xs text-slate-500 border-b border-slate-700">
        <th class="py-1.5 pr-6 font-medium">Status</th>
        <th class="py-1.5 font-medium">Meaning</th>
      </tr></thead>
      <tbody>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-6 font-mono text-xs text-red-400">400</td><td class="py-1.5 text-xs text-slate-400">Invalid request (missing or malformed params)</td></tr>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-6 font-mono text-xs text-red-400">401</td><td class="py-1.5 text-xs text-slate-400">Missing or invalid API key</td></tr>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-6 font-mono text-xs text-red-400">403</td><td class="py-1.5 text-xs text-slate-400">API key lacks required permission</td></tr>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-6 font-mono text-xs text-red-400">404</td><td class="py-1.5 text-xs text-slate-400">Project not found or not yet indexed</td></tr>
        <tr class="border-b border-slate-700/50"><td class="py-1.5 pr-6 font-mono text-xs text-red-400">500</td><td class="py-1.5 text-xs text-slate-400">Internal server error</td></tr>
      </tbody>
    </table>
  </div>
`)}
`;
}
