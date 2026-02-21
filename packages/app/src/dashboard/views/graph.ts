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

  const breadcrumb = `
<div style="margin-bottom:16px;font-size:0.875rem;">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true">${escapeHtml(projectName)}</a>
  <span style="color:#9ca3af;"> / </span>
  <span style="color:#6b7280;">Dependency Graph</span>
</div>`;

  const content =
    breadcrumb +
    `<h1 class="page-title">Dependency Graph</h1>` +
    `<div id="graph-container" style="width:100%;height:600px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;position:relative;overflow:hidden;">
      <div id="graph-loading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#6b7280;">
        Loading graph data...
      </div>
      <svg id="graph-svg" style="width:100%;height:100%;"></svg>
    </div>
    <div style="margin-top:8px;font-size:0.75rem;color:#9ca3af;">
      Drag nodes to reposition. Scroll to zoom. Click a node to see details.
    </div>
    <script src="https://d3js.org/d3.v7.min.js"></script>
    <script src="/public/graph.js"></script>
    <script>
      if (typeof renderDependencyGraph === 'function') {
        renderDependencyGraph(${projectId});
      }
    </script>`;

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

  return `
<div style="margin-bottom:16px;font-size:0.875rem;">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true">${escapeHtml(projectName)}</a>
  <span style="color:#9ca3af;"> / </span>
  <span style="color:#6b7280;">Dependency Graph</span>
</div>
<h1 class="page-title">Dependency Graph</h1>
<div id="graph-container" style="width:100%;height:600px;background:#fff;border:1px solid #e5e7eb;border-radius:8px;position:relative;overflow:hidden;">
  <div id="graph-loading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#6b7280;">
    Loading graph data...
  </div>
  <svg id="graph-svg" style="width:100%;height:100%;"></svg>
</div>
<script src="https://d3js.org/d3.v7.min.js"></script>
<script src="/public/graph.js"></script>
<script>
  if (typeof renderDependencyGraph === 'function') {
    renderDependencyGraph(${projectId});
  }
</script>`;
}
