/**
 * Findings list page with severity filters.
 */

import { layout } from "./layout.js";
import {
  escapeHtml,
  severityBadge,
  badge,
  table,
  projectTabNav,
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
    const url =
      sev === "all"
        ? `/projects/${projectId}/findings`
        : `/projects/${projectId}/findings?severity=${sev}`;
    const activeClasses = isActive
      ? "bg-purple-500 text-white"
      : "bg-slate-800 text-slate-400 ring-1 ring-inset ring-slate-700 hover:bg-slate-700 hover:text-slate-50";
    return `<a href="${url}"
               hx-get="${url}"
               hx-target="#main-content"
               hx-push-url="true"
               class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeClasses}">
              ${escapeHtml(sev === "all" ? "All" : sev.charAt(0).toUpperCase() + sev.slice(1))}
            </a>`;
  }).join("");

  return `<div class="flex gap-2 mb-4 flex-wrap">${buttons}</div>`;
}

// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------


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
      render: (f) => `<span class="font-medium text-slate-200">${escapeHtml(f.title)}</span>`,
    },
    {
      header: "Description",
      render: (f) => {
        const text = f.description.length > 120
          ? f.description.slice(0, 120) + "..."
          : f.description;
        return `<span class="text-slate-400 text-xs">${escapeHtml(text)}</span>`;
      },
    },
    {
      header: "Suggestion",
      render: (f) => {
        if (!f.suggestion) return `<span class="text-slate-600">—</span>`;
        const text = f.suggestion.length > 100
          ? f.suggestion.slice(0, 100) + "..."
          : f.suggestion;
        return `<span class="text-emerald-400 text-xs">${escapeHtml(text)}</span>`;
      },
    },
  ];

  const emptyState = `<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-12">
    <p class="text-sm text-slate-400">No findings yet. Run the analysis pipeline to detect issues.</p>
  </div>`;

  const content =
    projectTabNav(projectId, projectName, "findings") +
    `<h2 class="text-xl font-semibold text-slate-50 mb-4">Findings (${findings.length})</h2>` +
    filterBar(projectId, severityFilter) +
    (findings.length > 0 ? table(columns, findings) : emptyState);

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
      render: (f) => `<span class="font-medium text-slate-200">${escapeHtml(f.title)}</span>`,
    },
  ];

  return (
    projectTabNav(projectId, projectName, "findings") +
    `<h2 class="text-xl font-semibold text-slate-50 mb-4">Findings (${findings.length})</h2>` +
    filterBar(projectId, severityFilter) +
    table(columns, findings)
  );
}
