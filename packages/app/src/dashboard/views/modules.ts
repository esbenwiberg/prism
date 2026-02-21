/**
 * Module overview view — shows modules with summaries and metrics.
 */

import { layout } from "./layout.js";
import { escapeHtml, card, statCard, badge, table, type TableColumn } from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ModuleViewData {
  name: string;
  fileCount: number;
  totalLines: number;
  avgComplexity: number;
  summary: string | null;
}

export interface ModulesPageData {
  projectId: number;
  projectName: string;
  modules: ModuleViewData[];
  userName: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Render the module overview page.
 */
export function modulesPage(data: ModulesPageData): string {
  const { projectId, projectName, modules, userName } = data;

  const breadcrumb = `
<div style="margin-bottom:16px;font-size:0.875rem;">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true">${escapeHtml(projectName)}</a>
  <span style="color:#9ca3af;"> / </span>
  <span style="color:#6b7280;">Modules</span>
</div>`;

  const stats = `
<div class="stat-row">
  ${statCard("Modules", modules.length)}
  ${statCard("Total Files", modules.reduce((sum, m) => sum + m.fileCount, 0))}
  ${statCard("Total Lines", modules.reduce((sum, m) => sum + m.totalLines, 0).toLocaleString())}
</div>`;

  const columns: TableColumn<ModuleViewData>[] = [
    {
      header: "Module",
      render: (m) => `<strong>${escapeHtml(m.name)}</strong>`,
    },
    {
      header: "Files",
      render: (m) => String(m.fileCount),
      align: "center",
    },
    {
      header: "Lines",
      render: (m) => m.totalLines.toLocaleString(),
      align: "right",
    },
    {
      header: "Avg Complexity",
      render: (m) => {
        const val = m.avgComplexity.toFixed(1);
        const variant = m.avgComplexity > 20 ? "danger" : m.avgComplexity > 10 ? "warning" : "success";
        return badge(val, variant);
      },
      align: "center",
    },
    {
      header: "Summary",
      render: (m) => {
        if (!m.summary) return `<span style="color:#9ca3af;font-size:0.8125rem;">No summary</span>`;
        const text = m.summary.length > 150
          ? m.summary.slice(0, 150) + "..."
          : m.summary;
        return `<span style="font-size:0.8125rem;color:#4b5563;">${escapeHtml(text)}</span>`;
      },
    },
  ];

  const content =
    breadcrumb +
    `<h1 class="page-title">Modules (${modules.length})</h1>` +
    stats +
    (modules.length > 0
      ? table(columns, modules)
      : `<p style="color:#6b7280;">No modules found. Run the indexer first.</p>`);

  return layout({
    title: `${projectName} — Modules`,
    content,
    userName,
    activeNav: `project-${projectId}`,
  });
}

/**
 * Render just the content fragment (for HTMX partial updates).
 */
export function modulesFragment(data: ModulesPageData): string {
  const { projectId, projectName, modules } = data;

  const columns: TableColumn<ModuleViewData>[] = [
    {
      header: "Module",
      render: (m) => `<strong>${escapeHtml(m.name)}</strong>`,
    },
    {
      header: "Files",
      render: (m) => String(m.fileCount),
      align: "center",
    },
    {
      header: "Summary",
      render: (m) => {
        if (!m.summary) return "—";
        const text = m.summary.length > 100 ? m.summary.slice(0, 100) + "..." : m.summary;
        return `<span style="font-size:0.8125rem;">${escapeHtml(text)}</span>`;
      },
    },
  ];

  return `
<div style="margin-bottom:16px;font-size:0.875rem;">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true">${escapeHtml(projectName)}</a>
  <span style="color:#9ca3af;"> / </span>
  <span style="color:#6b7280;">Modules</span>
</div>
<h1 class="page-title">Modules (${modules.length})</h1>` +
    table(columns, modules);
}
