/**
 * Semantic search page and fragments for the dashboard.
 *
 * Provides a query input with debounced HTMX trigger and
 * a results list with relevance scores.
 */

import { layout } from "./layout.js";
import { escapeHtml, table, badge, type TableColumn } from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchResultViewData {
  score: number;
  filePath: string | null;
  symbolName: string | null;
  symbolKind: string | null;
  summaryContent: string;
}

export interface SearchPageData {
  projectId: number;
  projectName: string;
  query: string;
  results: SearchResultViewData[];
  userName: string;
}

// ---------------------------------------------------------------------------
// Search input
// ---------------------------------------------------------------------------

function searchInput(projectId: number, currentQuery: string): string {
  return `
<div class="mb-6">
  <input type="text"
         name="q"
         value="${escapeHtml(currentQuery)}"
         placeholder="Search symbols (e.g. 'authentication middleware')"
         hx-get="/projects/${projectId}/search"
         hx-trigger="keyup changed delay:300ms"
         hx-target="#search-results"
         hx-push-url="true"
         hx-include="this"
         class="block w-full max-w-2xl rounded-lg border border-slate-600 bg-slate-800 px-4 py-2.5 text-sm text-slate-50 placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
  />
</div>`;
}

// ---------------------------------------------------------------------------
// Score badge
// ---------------------------------------------------------------------------

function scoreBadge(score: number): string {
  const pct = (score * 100).toFixed(1);
  const variant =
    score >= 0.8 ? "success" : score >= 0.5 ? "info" : "neutral";
  return badge(`${pct}%`, variant);
}

// ---------------------------------------------------------------------------
// Results table
// ---------------------------------------------------------------------------

function resultsTable(results: SearchResultViewData[]): string {
  if (results.length === 0) {
    return `<p class="text-sm text-slate-400">No results found. Try a different query.</p>`;
  }

  const columns: TableColumn<SearchResultViewData>[] = [
    {
      header: "Score",
      render: (r) => scoreBadge(r.score),
      align: "center",
    },
    {
      header: "Kind",
      render: (r) => badge(r.symbolKind ?? "?", "neutral"),
    },
    {
      header: "Symbol",
      render: (r) => `<span class="font-medium text-slate-200">${escapeHtml(r.symbolName ?? "?")}</span>`,
    },
    {
      header: "File",
      render: (r) =>
        `<span class="font-mono text-xs text-slate-400">${escapeHtml(r.filePath ?? "?")}</span>`,
    },
    {
      header: "Summary",
      render: (r) => {
        const text =
          r.summaryContent.length > 120
            ? r.summaryContent.slice(0, 120) + "..."
            : r.summaryContent;
        return `<span class="text-xs text-slate-400">${escapeHtml(text)}</span>`;
      },
    },
  ];

  return table(columns, results);
}

// ---------------------------------------------------------------------------
// Full page
// ---------------------------------------------------------------------------

/**
 * Render the full search page.
 */
export function searchPage(data: SearchPageData): string {
  const { projectId, projectName, query, results, userName } = data;

  const breadcrumb = `<div class="mb-4 flex items-center gap-1.5 text-sm">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true"
     class="text-purple-400 hover:text-purple-300">${escapeHtml(projectName)}</a>
  <span class="text-slate-600">/</span>
  <span class="text-slate-400">Search</span>
</div>`;

  const content =
    breadcrumb +
    `<h2 class="text-2xl font-bold text-slate-50 mb-6">Semantic Search</h2>` +
    searchInput(projectId, query) +
    `<div id="search-results">` +
    resultsTable(results) +
    `</div>`;

  return layout({
    title: `${projectName} — Search`,
    content,
    userName,
    activeNav: `project-${projectId}`,
  });
}

/**
 * Render just the search results fragment (for HTMX partial updates).
 */
export function searchFragment(data: SearchPageData): string {
  return resultsTable(data.results);
}
