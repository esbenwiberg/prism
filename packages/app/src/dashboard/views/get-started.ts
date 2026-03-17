/**
 * Get Started guide page — onboarding steps for new users.
 */

import { layout } from "./layout.js";
import { card } from "./components.js";

/** Inline code styling helper to reduce repetition. */
const code = (text: string) =>
  `<code class="font-mono text-xs bg-slate-700 px-1 py-0.5 rounded">${text}</code>`;

/** Tool list item styling helper. */
const tool = (name: string, desc: string) =>
  `<li class="flex gap-2"><span class="text-purple-400 font-mono text-xs shrink-0 pt-0.5">${name}</span><span class="text-slate-400 text-xs">${desc}</span></li>`;

export function getStartedPage(userName: string): string {
  const content = `
<h2 class="text-2xl font-bold text-slate-50 mb-6">Get Started</h2>
<p class="text-slate-400 mb-8 max-w-2xl">Follow these steps to index your first codebase and start querying it from Claude Code, the REST API, or the dashboard.</p>

${card("1. Register a project", `
  <p class="text-sm text-slate-300 mb-2">Add a project via the dashboard or the MCP ${code("register_project")} tool.</p>
  <a href="/projects/new" class="text-purple-400 hover:text-purple-300 text-sm font-medium">+ Add Project</a>
`)}

${card("2. Create an API key", `
  <p class="text-sm text-slate-300 mb-2">Generate an API key and select the permissions it needs (read, index, register).</p>
  <a href="/api-keys" class="text-purple-400 hover:text-purple-300 text-sm font-medium">Manage API Keys</a>
`)}

${card("3. Connect Claude Code", `
  <p class="text-sm text-slate-300 mb-3">Add the following to your ${code(".mcp.json")} file:</p>
  <pre class="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto">{
  "mcpServers": {
    "prism": {
      "type": "url",
      "url": "PRISM_URL/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}</pre>
  <p class="text-sm text-slate-400 mt-2">Replace ${code("PRISM_URL")} and ${code("YOUR_API_KEY")} with your values. The project slug is passed per tool call.</p>
  <p class="text-sm text-slate-400 mt-3">The MCP server exposes <span class="text-slate-200 font-medium">11 tools</span> for AI agent integration:</p>
  <ul class="mt-2 space-y-1.5 list-none pl-0">
    ${tool("search_codebase", "Semantic search across indexed code")}
    ${tool("get_file_context", "File-level context with summaries, deps, and findings")}
    ${tool("get_module_context", "Module overview and public API")}
    ${tool("get_related_files", "Find related files via semantic similarity and dependency graph")}
    ${tool("get_architecture_overview", "High-level system architecture")}
    ${tool("get_change_context", "Change history, hotspots, and co-change patterns")}
    ${tool("get_review_context", "Drift review for recent changes")}
    ${tool("register_project", "Register a new project")}
    ${tool("delete_project", "Delete a project and all its data")}
    ${tool("trigger_reindex", "Enqueue a reindex request")}
    ${tool("get_project_status", "Check index status and progress")}
  </ul>
`)}

${card("4. Trigger indexing", `
  <p class="text-sm text-slate-300 mb-3">Start indexing from the project detail page or use the MCP ${code("trigger_reindex")} tool. The indexing pipeline runs through five layers:</p>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
    <div class="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/50">
      <span class="text-purple-400 text-xs font-medium">Structural</span>
      <p class="text-xs text-slate-400 mt-0.5">Parses files, extracts symbols and dependency edges using tree-sitter</p>
    </div>
    <div class="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/50">
      <span class="text-purple-400 text-xs font-medium">Documentation</span>
      <p class="text-xs text-slate-400 mt-0.5">Extracts inline docs, READMEs, and project purpose</p>
    </div>
    <div class="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/50">
      <span class="text-purple-400 text-xs font-medium">Semantic</span>
      <p class="text-xs text-slate-400 mt-0.5">Generates LLM summaries and vector embeddings for search</p>
    </div>
    <div class="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/50">
      <span class="text-purple-400 text-xs font-medium">Analysis</span>
      <p class="text-xs text-slate-400 mt-0.5">Detects modules, identifies findings and architecture patterns</p>
    </div>
    <div class="bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/50">
      <span class="text-purple-400 text-xs font-medium">History</span>
      <p class="text-xs text-slate-400 mt-0.5">Indexes git commits, change frequency, and co-change patterns across files</p>
    </div>
  </div>
  <p class="text-xs text-slate-500">The structural layer runs by default. Use the ${code("layers")} parameter to specify additional layers: ${code("structural")}, ${code("semantic")}, ${code("history")}.</p>
`)}

${card("5. Start querying", `
  <p class="text-sm text-slate-300 mb-3">Once indexing completes, use the context enricher tools to understand your codebase. Each tool serves a different purpose:</p>
  <div class="space-y-2">
    <div class="flex gap-3 items-start">
      <span class="text-purple-400 font-mono text-xs shrink-0 pt-0.5 w-48">search_codebase</span>
      <span class="text-sm text-slate-400">Semantic search — find relevant code and module summaries by natural language query</span>
    </div>
    <div class="flex gap-3 items-start">
      <span class="text-purple-400 font-mono text-xs shrink-0 pt-0.5 w-48">get_file_context</span>
      <span class="text-sm text-slate-400">File-level context — summary, blast radius, dependencies, exported symbols, and findings. Use before modifying a file.</span>
    </div>
    <div class="flex gap-3 items-start">
      <span class="text-purple-400 font-mono text-xs shrink-0 pt-0.5 w-48">get_module_context</span>
      <span class="text-sm text-slate-400">Module overview — role, files, external dependencies, public API, and findings</span>
    </div>
    <div class="flex gap-3 items-start">
      <span class="text-purple-400 font-mono text-xs shrink-0 pt-0.5 w-48">get_related_files</span>
      <span class="text-sm text-slate-400">Find related files via semantic similarity and dependency graph, ranked by relevance</span>
    </div>
    <div class="flex gap-3 items-start">
      <span class="text-purple-400 font-mono text-xs shrink-0 pt-0.5 w-48">get_architecture_overview</span>
      <span class="text-sm text-slate-400">System architecture — purpose, module map, inter-module dependencies, critical findings</span>
    </div>
    <div class="flex gap-3 items-start">
      <span class="text-purple-400 font-mono text-xs shrink-0 pt-0.5 w-48">get_change_context</span>
      <span class="text-sm text-slate-400">Change history — recent commits, change frequency, co-change patterns, and author distribution</span>
    </div>
    <div class="flex gap-3 items-start">
      <span class="text-purple-400 font-mono text-xs shrink-0 pt-0.5 w-48">get_review_context</span>
      <span class="text-sm text-slate-400">Drift review — architecture drift, redundancy, regressions, and hotspots for a time range</span>
    </div>
  </div>
  <p class="text-xs text-slate-500 mt-3">Use ${code("get_project_status")} to check indexing progress before querying.</p>
`)}

${card("6. Explore in the dashboard", `
  <p class="text-sm text-slate-300 mb-3">The dashboard provides visual exploration tools for each indexed project:</p>
  <div class="space-y-2">
    <div class="flex gap-3 items-start">
      <span class="text-slate-200 text-sm font-medium shrink-0 w-36">History tab</span>
      <span class="text-sm text-slate-400">Browse indexed commits, identify change hotspots, and discover co-change patterns — files that tend to change together.</span>
    </div>
    <div class="flex gap-3 items-start">
      <span class="text-slate-200 text-sm font-medium shrink-0 w-36">Context Explorer</span>
      <span class="text-sm text-slate-400">Interactively assemble context from files, modules, and architecture. Preview what an AI agent would see before using the API.</span>
    </div>
    <div class="flex gap-3 items-start">
      <span class="text-slate-200 text-sm font-medium shrink-0 w-36">Findings</span>
      <span class="text-sm text-slate-400">Review identified patterns, anti-patterns, and architectural issues across the codebase.</span>
    </div>
  </div>
  <a href="/projects" class="inline-block text-purple-400 hover:text-purple-300 text-sm font-medium mt-3">View Projects</a>
`)}

${card("7. Use the REST API", `
  <p class="text-sm text-slate-300 mb-3">All MCP tools are also available as REST endpoints for direct integration. Authenticate with a Bearer token in the ${code("Authorization")} header.</p>
  <p class="text-xs text-slate-400 mb-2">Example — search a project:</p>
  <pre class="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto">curl -X POST https://your-prism-url/api/projects/owner/repo/search \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "How does authentication work?", "maxResults": 10}'</pre>
  <p class="text-xs text-slate-500 mt-2">The base path is ${code("/api/projects/:owner/:repo/")} followed by the action. See the API documentation for all available endpoints.</p>
`)}
`;

  return layout({
    title: "Get Started",
    content,
    userName,
    activeNav: "get-started",
  });
}
