/**
 * Findings list page with severity filters.
 */

import { layout } from "./layout.js";
import {
  escapeHtml,
  severityBadge,
  badge,
  table,
  type TableColumn,
} from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FindingViewData {
  id: number;
  category: string;
  severity: string;
  title: string;
  description: string;
  suggestion: string | null;
  createdAt: Date;
}

export interface FindingsPageData {
  projectId: number;
  projectName: string;
  findings: FindingViewData[];
  userName: string;
  /** Currently active severity filter (empty string = all). */
  severityFilter?: string;
}

// ---------------------------------------------------------------------------
// Severity filter bar
// ---------------------------------------------------------------------------

const SEVERITIES = ["all", "critical", "high", "medium", "low", "info"];

function filterBar(projectId: number, activeFilter: string): string {
  const buttons = SEVERITIES.map((sev) => {
    const isActive = sev === activeFilter || (sev === "all" && !activeFilter);
    const style = isActive
      ? "background:#2563eb;color:#fff;"
      : "background:#f3f4f6;color:#374151;";
    const url =
      sev === "all"
        ? `/projects/${projectId}/findings`
        : `/projects/${projectId}/findings?severity=${sev}`;
    return `<a href="${url}"
               hx-get="${url}"
               hx-target="#main-content"
               hx-push-url="true"
               style="padding:6px 12px;border-radius:6px;text-decoration:none;font-size:0.75rem;font-weight:600;${style}">
              ${escapeHtml(sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1))}
            </a>`;
  }).join("");

  return `<div style="display:flex;gap:8px;margin-bottom:16px;">${buttons}</div>`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Render the full findings page.
 */
export function findingsPage(data: FindingsPageData): string {
  const { projectId, projectName, findings, userName, severityFilter = "" } = data;

  const columns: TableColumn<FindingViewData>[] = [
    {
      header: "Severity",
      render: (f) => severityBadge(f.severity),
      align: "center",
    },
    {
      header: "Category",
      render: (f) => badge(f.category, "neutral"),
    },
    {
      header: "Title",
      render: (f) => escapeHtml(f.title),
    },
    {
      header: "Description",
      render: (f) => {
        const text = f.description.length > 120
          ? f.description.slice(0, 120) + "..."
          : f.description;
        return `<span style="font-size:0.8125rem;color:#4b5563;">${escapeHtml(text)}</span>`;
      },
    },
    {
      header: "Suggestion",
      render: (f) => {
        if (!f.suggestion) return "—";
        const text = f.suggestion.length > 100
          ? f.suggestion.slice(0, 100) + "..."
          : f.suggestion;
        return `<span style="font-size:0.8125rem;color:#059669;">${escapeHtml(text)}</span>`;
      },
    },
  ];

  const breadcrumb = `
<div style="margin-bottom:16px;font-size:0.875rem;">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true">${escapeHtml(projectName)}</a>
  <span style="color:#9ca3af;"> / </span>
  <span style="color:#6b7280;">Findings</span>
</div>`;

  const content =
    breadcrumb +
    `<h1 class="page-title">Findings (${findings.length})</h1>` +
    filterBar(projectId, severityFilter) +
    (findings.length > 0
      ? table(columns, findings)
      : `<p style="color:#6b7280;">No findings yet. Run the analysis pipeline to detect issues.</p>`);

  return layout({
    title: `${projectName} — Findings`,
    content,
    userName,
    activeNav: `project-${projectId}`,
  });
}

/**
 * Render just the content fragment (for HTMX partial updates).
 */
export function findingsFragment(data: FindingsPageData): string {
  const { projectId, projectName, findings, severityFilter = "" } = data;

  const columns: TableColumn<FindingViewData>[] = [
    {
      header: "Severity",
      render: (f) => severityBadge(f.severity),
      align: "center",
    },
    {
      header: "Category",
      render: (f) => badge(f.category, "neutral"),
    },
    {
      header: "Title",
      render: (f) => escapeHtml(f.title),
    },
  ];

  return (
    `<div style="margin-bottom:16px;font-size:0.875rem;">
      <a href="/projects/${projectId}"
         hx-get="/projects/${projectId}"
         hx-target="#main-content"
         hx-push-url="true">${escapeHtml(projectName)}</a>
      <span style="color:#9ca3af;"> / </span>
      <span style="color:#6b7280;">Findings</span>
    </div>` +
    `<h1 class="page-title">Findings (${findings.length})</h1>` +
    filterBar(projectId, severityFilter) +
    table(columns, findings)
  );
}
