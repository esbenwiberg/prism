/**
 * Dependency graph view — interactive D3 force-directed graph.
 */

import { layout } from "./layout.js";
import { escapeHtml } from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GraphPageData {
  projectId: number;
  projectName: string;
  userName: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Render the dependency graph page with embedded D3 visualization.
 */
export function graphPage(data: GraphPageData): string {
  const { projectId, projectName, userName } = data;

  const breadcrumb = `<div class="mb-4 flex items-center gap-1.5 text-sm">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true"
     class="text-purple-400 hover:text-purple-300">${escapeHtml(projectName)}</a>
  <span class="text-slate-600">/</span>
  <span class="text-slate-400">Dependency Graph</span>
</div>`;

  const content =
    breadcrumb +
    `<h2 class="text-2xl font-bold text-slate-50 mb-6">Dependency Graph</h2>` +
    `<div id="graph-container" data-project-id="${projectId}" class="w-full rounded-xl border border-slate-700 bg-slate-800 relative overflow-hidden" style="height:600px;">
      <div id="graph-loading" class="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
        Loading graph data...
      </div>
      <svg id="graph-svg" class="w-full h-full"></svg>
    </div>
    <p class="mt-2 text-xs text-slate-500">Drag nodes to reposition. Scroll to zoom. Click a node to see details.</p>
    <script src="/public/graph.js"></script>`;

  return layout({
    title: `${projectName} — Dependency Graph`,
    content,
    userName,
    activeNav: `project-${projectId}`,
  });
}

/**
 * Render just the content fragment (for HTMX partial updates).
 */
export function graphFragment(data: GraphPageData): string {
  const { projectId, projectName } = data;

  return `<div class="mb-4 flex items-center gap-1.5 text-sm">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true"
     class="text-purple-400 hover:text-purple-300">${escapeHtml(projectName)}</a>
  <span class="text-slate-600">/</span>
  <span class="text-slate-400">Dependency Graph</span>
</div>
<h2 class="text-2xl font-bold text-slate-50 mb-6">Dependency Graph</h2>
<div id="graph-container" data-project-id="${projectId}" class="w-full rounded-xl border border-slate-700 bg-slate-800 relative overflow-hidden" style="height:600px;">
  <div id="graph-loading" class="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
    Loading graph data...
  </div>
  <svg id="graph-svg" class="w-full h-full"></svg>
</div>
<p class="mt-2 text-xs text-slate-500">Drag nodes to reposition. Scroll to zoom. Click a node to see details.</p>
<script src="/public/graph.js"></script>`;
}
