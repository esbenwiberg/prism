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
<div style="margin-bottom:24px;">
  <input type="text"
         name="q"
         value="${escapeHtml(currentQuery)}"
         placeholder="Search symbols (e.g. 'authentication middleware')"
         hx-get="/projects/${projectId}/search"
         hx-trigger="keyup changed delay:300ms"
         hx-target="#search-results"
         hx-push-url="true"
         hx-include="this"
         style="width:100%;max-width:600px;padding:10px 14px;border:1px solid #d1d5db;border-radius:8px;font-size:0.875rem;outline:none;"
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
    return `<p style="color:#6b7280;">No results found. Try a different query.</p>`;
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
      render: (r) => `<strong>${escapeHtml(r.symbolName ?? "?")}</strong>`,
    },
    {
      header: "File",
      render: (r) =>
        `<span style="font-size:0.8125rem;color:#4b5563;">${escapeHtml(r.filePath ?? "?")}</span>`,
    },
    {
      header: "Summary",
      render: (r) => {
        const text =
          r.summaryContent.length > 120
            ? r.summaryContent.slice(0, 120) + "..."
            : r.summaryContent;
        return `<span style="font-size:0.8125rem;color:#374151;">${escapeHtml(text)}</span>`;
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

  const breadcrumb = `
<div style="margin-bottom:16px;font-size:0.875rem;">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true">${escapeHtml(projectName)}</a>
  <span style="color:#9ca3af;"> / </span>
  <span style="color:#6b7280;">Search</span>
</div>`;

  const content =
    breadcrumb +
    `<h1 class="page-title">Semantic Search</h1>` +
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
