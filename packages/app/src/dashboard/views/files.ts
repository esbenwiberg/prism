/**
 * File browser page with metrics (complexity, coupling).
 */

import { layout } from "./layout.js";
import {
  escapeHtml,
  badge,
  table,
  type TableColumn,
  type BadgeVariant,
} from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FileViewData {
  id: number;
  path: string;
  language: string | null;
  lineCount: number | null;
  complexity: string | null;
  coupling: string | null;
  cohesion: string | null;
  isDoc: boolean;
  isTest: boolean;
  isConfig: boolean;
}

export interface FilesPageData {
  projectId: number;
  projectName: string;
  files: FileViewData[];
  userName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function metricBadge(value: string | null, thresholds: [number, number]): string {
  if (value === null) return badge("—", "neutral");
  const num = parseFloat(value);
  if (isNaN(num)) return badge(value, "neutral");

  let variant: BadgeVariant;
  if (num <= thresholds[0]) variant = "success";
  else if (num <= thresholds[1]) variant = "warning";
  else variant = "danger";

  return badge(num.toFixed(1), variant);
}

function fileTypeBadges(file: FileViewData): string {
  const badges: string[] = [];
  if (file.isDoc) badges.push(badge("doc", "info"));
  if (file.isTest) badges.push(badge("test", "info"));
  if (file.isConfig) badges.push(badge("config", "neutral"));
  return badges.join(" ");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Render the full files page.
 */
export function filesPage(data: FilesPageData): string {
  const { projectId, projectName, files, userName } = data;

  const columns: TableColumn<FileViewData>[] = [
    {
      header: "Path",
      render: (f) => escapeHtml(f.path),
    },
    {
      header: "Language",
      render: (f) => escapeHtml(f.language ?? "—"),
    },
    {
      header: "Lines",
      render: (f) => escapeHtml(String(f.lineCount ?? "—")),
      align: "right",
    },
    {
      header: "Complexity",
      render: (f) => metricBadge(f.complexity, [10, 20]),
      align: "center",
    },
    {
      header: "Coupling",
      render: (f) => metricBadge(f.coupling, [5, 10]),
      align: "center",
    },
    {
      header: "Cohesion",
      render: (f) => metricBadge(f.cohesion, [0.3, 0.6]),
      align: "center",
    },
    {
      header: "Tags",
      render: (f) => fileTypeBadges(f),
    },
  ];

  const breadcrumb = `
<div style="margin-bottom:16px;font-size:0.875rem;">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true">${escapeHtml(projectName)}</a>
  <span style="color:#9ca3af;"> / </span>
  <span style="color:#6b7280;">Files</span>
</div>`;

  const content =
    breadcrumb +
    `<h1 class="page-title">Files (${files.length})</h1>` +
    (files.length > 0
      ? table(columns, files)
      : `<p style="color:#6b7280;">No files indexed yet. Run <code>prism index</code> first.</p>`);

  return layout({
    title: `${projectName} — Files`,
    content,
    userName,
    activeNav: `project-${projectId}`,
  });
}

/**
 * Render just the content fragment (for HTMX partial updates).
 */
export function filesFragment(data: FilesPageData): string {
  const { projectId, projectName, files } = data;

  const columns: TableColumn<FileViewData>[] = [
    {
      header: "Path",
      render: (f) => escapeHtml(f.path),
    },
    {
      header: "Lines",
      render: (f) => escapeHtml(String(f.lineCount ?? "—")),
      align: "right",
    },
    {
      header: "Complexity",
      render: (f) => metricBadge(f.complexity, [10, 20]),
      align: "center",
    },
    {
      header: "Coupling",
      render: (f) => metricBadge(f.coupling, [5, 10]),
      align: "center",
    },
  ];

  return (
    `<div style="margin-bottom:16px;font-size:0.875rem;">
      <a href="/projects/${projectId}"
         hx-get="/projects/${projectId}"
         hx-target="#main-content"
         hx-push-url="true">${escapeHtml(projectName)}</a>
      <span style="color:#9ca3af;"> / </span>
      <span style="color:#6b7280;">Files</span>
    </div>` +
    `<h1 class="page-title">Files (${files.length})</h1>` +
    table(columns, files)
  );
}
