/**
 * Module overview view — shows modules with summaries and metrics.
 */

import { layout } from "./layout.js";
import { escapeHtml, statCard, badge, table, type TableColumn } from "./components.js";

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
// Helpers
// ---------------------------------------------------------------------------

function breadcrumb(projectId: number, projectName: string): string {
  return `<div class="mb-4 flex items-center gap-1.5 text-sm">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true"
     class="text-purple-400 hover:text-purple-300">${escapeHtml(projectName)}</a>
  <span class="text-slate-600">/</span>
  <span class="text-slate-400">Modules</span>
</div>`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Render the module overview page.
 */
export function modulesPage(data: ModulesPageData): string {
  const { projectId, projectName, modules, userName } = data;

  const stats = `
<div class="flex gap-4 flex-wrap mb-6">
  ${statCard("Modules", modules.length)}
  ${statCard("Total Files", modules.reduce((sum, m) => sum + m.fileCount, 0))}
  ${statCard("Total Lines", modules.reduce((sum, m) => sum + m.totalLines, 0).toLocaleString())}
</div>`;

  const columns: TableColumn<ModuleViewData>[] = [
    {
      header: "Module",
      render: (m) => `<span class="font-medium text-slate-200">${escapeHtml(m.name)}</span>`,
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
        if (!m.summary) return `<span class="text-slate-600 text-xs">No summary</span>`;
        const text = m.summary.length > 150
          ? m.summary.slice(0, 150) + "..."
          : m.summary;
        return `<span class="text-xs text-slate-400">${escapeHtml(text)}</span>`;
      },
    },
  ];

  const emptyState = `<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-12">
    <p class="text-sm text-slate-400">No modules found. Run the indexer first.</p>
  </div>`;

  const content =
    breadcrumb(projectId, projectName) +
    `<h2 class="text-2xl font-bold text-slate-50 mb-6">Modules (${modules.length})</h2>` +
    stats +
    (modules.length > 0 ? table(columns, modules) : emptyState);

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
      render: (m) => `<span class="font-medium text-slate-200">${escapeHtml(m.name)}</span>`,
    },
    {
      header: "Files",
      render: (m) => String(m.fileCount),
      align: "center",
    },
    {
      header: "Summary",
      render: (m) => {
        if (!m.summary) return `<span class="text-slate-600">—</span>`;
        const text = m.summary.length > 100 ? m.summary.slice(0, 100) + "..." : m.summary;
        return `<span class="text-xs text-slate-400">${escapeHtml(text)}</span>`;
      },
    },
  ];

  return (
    breadcrumb(projectId, projectName) +
    `<h2 class="text-2xl font-bold text-slate-50 mb-6">Modules (${modules.length})</h2>` +
    table(columns, modules)
  );
}
