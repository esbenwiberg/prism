/**
 * Dependency graph view — interactive D3 force-directed graph.
 */

import { layout } from "./layout.js";
import { escapeHtml, projectTabNav } from "./components.js";

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

  const content =
    projectTabNav(projectId, projectName, "graph") +
    `<h2 class="text-xl font-semibold text-slate-50 mb-6">Dependency Graph</h2>` +
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

  return projectTabNav(projectId, projectName, "graph") +
    `<h2 class="text-xl font-semibold text-slate-50 mb-6">Dependency Graph</h2>
<div id="graph-container" data-project-id="${projectId}" class="w-full rounded-xl border border-slate-700 bg-slate-800 relative overflow-hidden" style="height:600px;">
  <div id="graph-loading" class="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
    Loading graph data...
  </div>
  <svg id="graph-svg" class="w-full h-full"></svg>
</div>
<p class="mt-2 text-xs text-slate-500">Drag nodes to reposition. Scroll to zoom. Click a node to see details.</p>
<script src="/public/graph.js"></script>`;
}
