/**
 * Re-index runs page — /reindex-runs
 *
 * Shows the pending reindex request queue, active/running jobs,
 * and recent history for all index-type jobs.
 */

import type { ReindexRequestWithProject } from "@prism/core";
import type { IndexJobWithProject } from "@prism/core";
import { badge, card, emptyState, escapeHtml, statusBadge, table } from "./components.js";
import { layout } from "./layout.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLayers(layers: unknown): string {
  if (!Array.isArray(layers) || layers.length === 0) return "all";
  return (layers as string[]).map((l) => escapeHtml(l)).join(", ");
}

function formatRelative(date: Date | null | undefined): string {
  if (!date) return "—";
  return `<time data-local datetime="${escapeHtml(date.toISOString())}">${escapeHtml(date.toISOString())}</time>`;
}

function formatDuration(startedAt: Date | null, completedAt: Date | null): string {
  if (!startedAt || !completedAt) return "—";
  const ms = completedAt.getTime() - startedAt.getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

// ---------------------------------------------------------------------------
// Active section (queue + running jobs) — returned as a fragment for polling
// ---------------------------------------------------------------------------

export function reindexActiveFragment(
  queue: ReindexRequestWithProject[],
  activeJobs: IndexJobWithProject[],
): string {
  const queueSection =
    queue.length === 0
      ? emptyState("No pending requests")
      : table(
          [
            { header: "Project", render: (r) => escapeHtml(r.projectName) },
            { header: "Layers", render: (r) => `<code class="text-xs text-slate-300">${formatLayers(r.layers)}</code>` },
            { header: "Queued", render: (r) => formatRelative(r.requestedAt) },
          ],
          queue,
        );

  const activeSection =
    activeJobs.length === 0
      ? emptyState("No active jobs")
      : table(
          [
            { header: "Project", render: (r) => escapeHtml(r.projectName) },
            {
              header: "Layers",
              render: (r) =>
                `<code class="text-xs text-slate-300">${formatLayers((r.options as { layers?: unknown } | null)?.layers)}</code>`,
            },
            { header: "Status", render: (r) => statusBadge(r.status) },
            { header: "Started", render: (r) => formatRelative(r.startedAt) },
          ],
          activeJobs,
        );

  return `
<div class="space-y-6"
     hx-get="/reindex-runs/active"
     hx-trigger="every 10s"
     hx-swap="outerHTML">
  ${card("Pending Queue", queueSection)}
  ${card("Running / Queued Jobs", activeSection)}
</div>`;
}

// ---------------------------------------------------------------------------
// Full page
// ---------------------------------------------------------------------------

export interface ReindexRunsData {
  queue: ReindexRequestWithProject[];
  activeJobs: IndexJobWithProject[];
  historyJobs: IndexJobWithProject[];
}

function historySection(jobs: IndexJobWithProject[]): string {
  if (jobs.length === 0) return emptyState("No completed runs yet");

  return table(
    [
      { header: "Project", render: (r) => escapeHtml(r.projectName) },
      {
        header: "Layers",
        render: (r) =>
          `<code class="text-xs text-slate-300">${formatLayers((r.options as { layers?: unknown } | null)?.layers)}</code>`,
      },
      { header: "Status", render: (r) => statusBadge(r.status) },
      { header: "Duration", render: (r) => formatDuration(r.startedAt, r.completedAt) },
      { header: "Completed", render: (r) => formatRelative(r.completedAt) },
      {
        header: "Error",
        render: (r) =>
          r.error
            ? `<span class="text-red-400 text-xs font-mono" title="${escapeHtml(r.error)}">${escapeHtml(r.error.slice(0, 60))}${r.error.length > 60 ? "…" : ""}</span>`
            : "—",
      },
    ],
    jobs,
  );
}

export function reindexRunsPage(data: ReindexRunsData, userName: string): string {
  const totalActive = data.queue.length + data.activeJobs.length;

  const content = `<div class="space-y-8">
    <div>
      <h2 class="text-xl font-semibold text-slate-50">Re-index Runs</h2>
      <p class="mt-1 text-sm text-slate-400">
        Active requests auto-refresh every 10 s.
        ${totalActive > 0 ? badge(`${totalActive} active`, "info") : ""}
      </p>
    </div>

    ${reindexActiveFragment(data.queue, data.activeJobs)}

    ${card("Recent History", historySection(data.historyJobs))}
  </div>`;

  return layout({ title: "Re-index Runs", content, userName, activeNav: "reindex-runs" });
}
