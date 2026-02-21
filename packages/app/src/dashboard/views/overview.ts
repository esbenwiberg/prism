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
        `<a href="/projects/${p.id}" hx-get="/projects/${p.id}" hx-target="#main-content" hx-push-url="true">${escapeHtml(p.name)}</a>`,
    },
    {
      header: "Path",
      render: (p) => escapeHtml(p.path),
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

  const content =
    `<h1 class="page-title">Projects</h1>` +
    (projects.length > 0
      ? table(columns, projects)
      : `<p style="color:#6b7280;">No projects registered yet. Use <code>prism init</code> to add one.</p>`);

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
        `<a href="/projects/${p.id}" hx-get="/projects/${p.id}" hx-target="#main-content" hx-push-url="true">${escapeHtml(p.name)}</a>`,
    },
    {
      header: "Path",
      render: (p) => escapeHtml(p.path),
    },
    {
      header: "Status",
      render: (p) => statusBadge(p.indexStatus),
    },
  ];

  return `<h1 class="page-title">Projects</h1>` +
    (projects.length > 0
      ? table(columns, projects)
      : `<p style="color:#6b7280;">No projects registered yet.</p>`);
}
