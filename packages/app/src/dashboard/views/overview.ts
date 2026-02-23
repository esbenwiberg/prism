/**
 * Overview page — lists all projects.
 */

import type { Project } from "@prism/core";
import { layout } from "./layout.js";
import {
  escapeHtml,
  statusBadge,
  table,
  type TableColumn,
} from "./components.js";

/**
 * Render the full overview page.
 */
export function overviewPage(
  projects: Project[],
  userName: string,
): string {
  const columns: TableColumn<Project>[] = [
    {
      header: "Name",
      render: (p) =>
        `<a href="/projects/${p.id}" hx-get="/projects/${p.id}" hx-target="#main-content" hx-push-url="true" class="text-purple-400 hover:text-purple-300 font-medium">${escapeHtml(p.name)}</a>`,
    },
    {
      header: "Path",
      render: (p) => `<span class="font-mono text-xs text-slate-400">${escapeHtml(p.path)}</span>`,
    },
    {
      header: "Language",
      render: (p) => escapeHtml(p.language ?? "—"),
    },
    {
      header: "Files",
      render: (p) => escapeHtml(String(p.totalFiles ?? "—")),
      align: "right",
    },
    {
      header: "Symbols",
      render: (p) => escapeHtml(String(p.totalSymbols ?? "—")),
      align: "right",
    },
    {
      header: "Status",
      render: (p) => statusBadge(p.indexStatus),
    },
  ];

  const addButton = `<a href="/projects/new"
    hx-get="/projects/new"
    hx-target="#main-content"
    hx-push-url="true"
    class="inline-flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-400 mb-6">
    + Add Project
  </a>`;

  const emptyState = `<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-12 px-6">
    <svg class="h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
    </svg>
    <p class="mt-3 text-sm text-slate-400">No projects registered yet. Click "Add Project" or use <code class="font-mono text-xs">prism init</code> to add one.</p>
  </div>`;

  const content =
    `<h2 class="text-2xl font-bold text-slate-50 mb-6">Projects</h2>` +
    addButton +
    (projects.length > 0 ? table(columns, projects) : emptyState);

  return layout({
    title: "Overview",
    content,
    userName,
    activeNav: "overview",
  });
}

/**
 * Render just the content fragment (for HTMX partial updates).
 */
export function overviewFragment(projects: Project[]): string {
  const columns: TableColumn<Project>[] = [
    {
      header: "Name",
      render: (p) =>
        `<a href="/projects/${p.id}" hx-get="/projects/${p.id}" hx-target="#main-content" hx-push-url="true" class="text-purple-400 hover:text-purple-300 font-medium">${escapeHtml(p.name)}</a>`,
    },
    {
      header: "Path",
      render: (p) => `<span class="font-mono text-xs text-slate-400">${escapeHtml(p.path)}</span>`,
    },
    {
      header: "Status",
      render: (p) => statusBadge(p.indexStatus),
    },
  ];

  const addButton = `<a href="/projects/new"
    hx-get="/projects/new"
    hx-target="#main-content"
    hx-push-url="true"
    class="inline-flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-400 mb-6">
    + Add Project
  </a>`;

  return `<h2 class="text-2xl font-bold text-slate-50 mb-6">Projects</h2>` +
    addButton +
    (projects.length > 0
      ? table(columns, projects)
      : `<p class="text-sm text-slate-400">No projects registered yet.</p>`);
}
