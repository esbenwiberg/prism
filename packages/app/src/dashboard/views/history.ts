/**
 * Git History page — commits, change hotspots, co-change patterns.
 */

import { layout } from "./layout.js";
import {
  escapeHtml,
  statCard,
  table,
  card,
  projectTabNav,
  type TableColumn,
} from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HistoryPageData {
  projectId: number;
  projectName: string;
  commits: Array<{
    sha: string;
    authorName: string | null;
    committedAt: Date | null;
    message: string;
    fileCount?: number;
  }>;
  hotspots: Array<{ filePath: string; fileId: number; changeCount: number }>;
  coChanges?: Array<{ filePath: string; coChangeCount: number }>;
  selectedFileId?: number;
  selectedFilePath?: string;
  totalAuthors: number;
  userName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}

// ---------------------------------------------------------------------------
// Content builder (shared by page and fragment)
// ---------------------------------------------------------------------------

function buildContent(data: HistoryPageData): string {
  const {
    projectId,
    projectName,
    commits,
    hotspots,
    coChanges,
    selectedFileId,
    selectedFilePath,
    totalAuthors,
  } = data;

  const parts: string[] = [];

  // Tab nav
  parts.push(projectTabNav(projectId, projectName, "history"));

  // ---- Stats row ----
  const topHotspot = hotspots.length > 0 ? hotspots[0].filePath : "—";
  parts.push(`<div class="flex flex-wrap gap-4 mb-6">`);
  parts.push(statCard("Total Commits", commits.length, { color: "purple" }));
  parts.push(statCard("Unique Authors", totalAuthors, { color: "blue" }));
  parts.push(statCard("Most Active File", truncate(topHotspot, 40)));
  parts.push(`</div>`);

  // ---- Re-run history layer button ----
  parts.push(`<div class="mb-6">
  <form hx-post="/projects/${projectId}/run-layer" hx-target="#main-content" hx-swap="innerHTML">
    <input type="hidden" name="layer" value="history" />
    <button type="submit"
      class="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-50 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-slate-900">
      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
      </svg>
      Re-run History Layer
    </button>
  </form>
</div>`);

  // ---- Change Hotspots ----
  if (hotspots.length > 0) {
    type Hotspot = HistoryPageData["hotspots"][number];

    const hotspotColumns: TableColumn<Hotspot>[] = [
      {
        header: "File Path",
        render: (h) =>
          `<a href="/projects/${projectId}/history?fileId=${h.fileId}"
              hx-get="/projects/${projectId}/history?fileId=${h.fileId}"
              hx-target="#main-content" hx-push-url="true"
              class="text-purple-400 hover:text-purple-300 font-mono text-xs">${escapeHtml(h.filePath)}</a>`,
      },
      {
        header: "Changes",
        render: (h) => `<span class="font-semibold text-slate-50">${h.changeCount}</span>`,
        align: "right",
      },
    ];

    parts.push(card("Change Hotspots", table(hotspotColumns, hotspots)));
  } else {
    parts.push(
      card(
        "Change Hotspots",
        `<p class="text-sm text-slate-400">No change data available. Run the history layer first.</p>`,
      ),
    );
  }

  // ---- Co-Change Patterns ----
  if (selectedFileId !== undefined && coChanges) {
    type CoChange = NonNullable<HistoryPageData["coChanges"]>[number];

    const coChangeColumns: TableColumn<CoChange>[] = [
      {
        header: "File Path",
        render: (c) =>
          `<span class="font-mono text-xs text-slate-300">${escapeHtml(c.filePath)}</span>`,
      },
      {
        header: "Co-Changes",
        render: (c) => `<span class="font-semibold text-slate-50">${c.coChangeCount}</span>`,
        align: "right",
      },
    ];

    const coChangeContent =
      coChanges.length > 0
        ? table(coChangeColumns, coChanges)
        : `<p class="text-sm text-slate-400">No co-change patterns found for this file.</p>`;

    parts.push(
      card(
        `Co-Change Patterns: ${escapeHtml(selectedFilePath ?? `File #${selectedFileId}`)}`,
        coChangeContent,
      ),
    );
  } else {
    parts.push(
      card(
        "Co-Change Patterns",
        `<p class="text-sm text-slate-400">Click a hotspot file above to see which files frequently change together with it.</p>`,
      ),
    );
  }

  // ---- Recent Commits ----
  if (commits.length > 0) {
    type Commit = HistoryPageData["commits"][number];

    const commitColumns: TableColumn<Commit>[] = [
      {
        header: "SHA",
        render: (c) =>
          `<span class="font-mono text-xs text-purple-400">${escapeHtml(c.sha.slice(0, 7))}</span>`,
      },
      {
        header: "Author",
        render: (c) => escapeHtml(c.authorName ?? "—"),
      },
      {
        header: "Date",
        render: (c) => {
          if (!c.committedAt) return "—";
          const iso = c.committedAt instanceof Date ? c.committedAt.toISOString() : String(c.committedAt);
          return `<time data-local datetime="${escapeHtml(iso)}">${escapeHtml(formatDate(c.committedAt instanceof Date ? c.committedAt : new Date(String(c.committedAt))))}</time>`;
        },
      },
      {
        header: "Message",
        render: (c) =>
          `<span class="text-slate-300">${escapeHtml(truncate(c.message, 80))}</span>`,
      },
      {
        header: "Files Changed",
        render: (c) =>
          c.fileCount !== undefined
            ? `<span class="text-slate-400">${c.fileCount}</span>`
            : `<span class="text-slate-500">—</span>`,
        align: "right",
      },
    ];

    parts.push(card("Recent Commits", table(commitColumns, commits.slice(0, 30))));
  } else {
    parts.push(
      card(
        "Recent Commits",
        `<p class="text-sm text-slate-400">No commits found. Run the history layer to index git history.</p>`,
      ),
    );
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Render the full history page.
 */
export function historyPage(data: HistoryPageData): string {
  return layout({
    title: `${data.projectName} — History`,
    content: buildContent(data),
    userName: data.userName,
    activeNav: `project-${data.projectId}`,
  });
}

/**
 * Render just the content fragment (for HTMX partial updates).
 */
export function historyFragment(data: HistoryPageData): string {
  return buildContent(data);
}
