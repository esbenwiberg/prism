/**
 * Get Started guide page — onboarding steps for new users.
 */

import { layout } from "./layout.js";
import { card } from "./components.js";

export function getStartedPage(userName: string): string {
  const content = `
<h2 class="text-2xl font-bold text-slate-50 mb-6">Get Started</h2>
<p class="text-slate-400 mb-8 max-w-2xl">Follow these steps to index your first codebase and start querying it from Claude Code.</p>

${card("1. Register a project", `
  <p class="text-sm text-slate-300 mb-2">Add a project via the dashboard or the MCP <code class="font-mono text-xs bg-slate-700 px-1 py-0.5 rounded">register_project</code> tool.</p>
  <a href="/projects/new" class="text-purple-400 hover:text-purple-300 text-sm font-medium">+ Add Project</a>
`)}

${card("2. Create an API key", `
  <p class="text-sm text-slate-300 mb-2">Generate an API key and select the permissions it needs (read, index, register).</p>
  <a href="/api-keys" class="text-purple-400 hover:text-purple-300 text-sm font-medium">Manage API Keys</a>
`)}

${card("3. Connect Claude Code", `
  <p class="text-sm text-slate-300 mb-3">Add the following to your <code class="font-mono text-xs bg-slate-700 px-1 py-0.5 rounded">.mcp.json</code> file:</p>
  <pre class="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto">{
  "mcpServers": {
    "prism": {
      "type": "url",
      "url": "PRISM_URL/mcp?project=owner/repo",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}</pre>
  <p class="text-sm text-slate-400 mt-2">Replace <code class="font-mono text-xs bg-slate-700 px-1 py-0.5 rounded">PRISM_URL</code>, <code class="font-mono text-xs bg-slate-700 px-1 py-0.5 rounded">owner/repo</code>, and <code class="font-mono text-xs bg-slate-700 px-1 py-0.5 rounded">YOUR_API_KEY</code> with your values.</p>
`)}

${card("4. Trigger indexing", `
  <p class="text-sm text-slate-300">Start indexing from the project detail page or use the MCP <code class="font-mono text-xs bg-slate-700 px-1 py-0.5 rounded">trigger_reindex</code> tool. The first index runs the structural layer by default.</p>
`)}

${card("5. Start querying", `
  <p class="text-sm text-slate-300">Once indexing completes, use <code class="font-mono text-xs bg-slate-700 px-1 py-0.5 rounded">search_codebase</code> to ask questions about your code. Use <code class="font-mono text-xs bg-slate-700 px-1 py-0.5 rounded">get_project_status</code> to check progress.</p>
`)}
`;

  return layout({
    title: "Get Started",
    content,
    userName,
    activeNav: "get-started",
  });
}
