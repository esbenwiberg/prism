/**
 * Summaries page — function/file/module/system level AI summaries (Layer 2).
 *
 * Shows a filterable table of summaries, with a level toggle filter bar.
 * The "purpose" level has its own dedicated page and is excluded here.
 */

import { layout } from "./layout.js";
import {
  escapeHtml,
  badge,
  statCard,
  table,
  projectTabNav,
  type TableColumn,
} from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SummaryViewData {
  id: number;
  targetId: string;
  content: string;
  model: string | null;
}

export interface SummariesPageData {
  projectId: number;
  projectName: string;
  summaries: SummaryViewData[];
  userName: string;
  levelFilter?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEVELS = ["function", "file", "module", "system"];


function filterBar(projectId: number, activeLevel: string): string {
  const buttons = LEVELS.map((lvl) => {
    const isActive = lvl === activeLevel;
    const url = `/projects/${projectId}/summaries?level=${lvl}`;
    const activeClasses = isActive
      ? "bg-purple-500 text-white"
      : "bg-slate-800 text-slate-400 ring-1 ring-inset ring-slate-700 hover:bg-slate-700 hover:text-slate-50";
    return `<a href="${url}"
               hx-get="${url}"
               hx-target="#main-content"
               hx-push-url="true"
               class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeClasses}">
              ${escapeHtml(lvl.charAt(0).toUpperCase() + lvl.slice(1))}
            </a>`;
  }).join("");

  return `<div class="flex gap-2 mb-4 flex-wrap">${buttons}</div>`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const COLUMNS: TableColumn<SummaryViewData>[] = [
  {
    header: "Target",
    render: (s) => `<span class="font-mono text-xs text-slate-300">${escapeHtml(s.targetId)}</span>`,
  },
  {
    header: "Content",
    render: (s) => {
      const text = s.content.length > 200
        ? s.content.slice(0, 200) + "..."
        : s.content;
      return `<span class="text-xs text-slate-400">${escapeHtml(text)}</span>`;
    },
  },
  {
    header: "Model",
    render: (s) => s.model
      ? badge(s.model, "neutral")
      : `<span class="text-slate-600">—</span>`,
    align: "center",
  },
];

/**
 * Render the full summaries page.
 */
export function summariesPage(data: SummariesPageData): string {
  const { projectId, projectName, summaries, userName, levelFilter = "function" } = data;

  const stats = `
<div class="flex gap-4 flex-wrap mb-6">
  ${statCard("Summaries", summaries.length)}
</div>`;

  const emptyState = `<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-12">
    <p class="text-sm text-slate-400">No summaries at this level yet. Run the documentation layer to generate them.</p>
  </div>`;

  const content =
    projectTabNav(projectId, projectName, "summaries") +
    `<h2 class="text-xl font-semibold text-slate-50 mb-4">Summaries</h2>` +
    stats +
    filterBar(projectId, levelFilter) +
    (summaries.length > 0 ? table(COLUMNS, summaries) : emptyState);

  return layout({
    title: `${projectName} — Summaries`,
    content,
    userName,
    activeNav: `project-${projectId}`,
  });
}

/**
 * Render just the content fragment (for HTMX partial updates).
 */
export function summariesFragment(data: SummariesPageData): string {
  const { projectId, projectName, summaries, levelFilter = "function" } = data;

  const emptyState = `<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-12">
    <p class="text-sm text-slate-400">No summaries at this level yet. Run the documentation layer to generate them.</p>
  </div>`;

  const fragmentColumns: TableColumn<SummaryViewData>[] = [
    {
      header: "Target",
      render: (s) => `<span class="font-mono text-xs text-slate-300">${escapeHtml(s.targetId)}</span>`,
    },
    {
      header: "Content",
      render: (s) => {
        const text = s.content.length > 200
          ? s.content.slice(0, 200) + "..."
          : s.content;
        return `<span class="text-xs text-slate-400">${escapeHtml(text)}</span>`;
      },
    },
    {
      header: "Model",
      render: (s) => s.model
        ? badge(s.model, "neutral")
        : `<span class="text-slate-600">—</span>`,
      align: "center",
    },
  ];

  return (
    projectTabNav(projectId, projectName, "summaries") +
    `<h2 class="text-xl font-semibold text-slate-50 mb-4">Summaries</h2>` +
    filterBar(projectId, levelFilter) +
    (summaries.length > 0 ? table(fragmentColumns, summaries) : emptyState)
  );
}
