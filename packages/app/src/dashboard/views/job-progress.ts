/**
 * Job progress HTMX polling fragment.
 *
 * Shows the latest job status, current indexing layer,
 * files processed/total, elapsed time, and cost.
 * Polls every 3s when a job is running or pending.
 */

import type { JobRow, IndexRunRow } from "@prism/core";
import { escapeHtml, statusBadge } from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JobProgressData {
  projectId: number;
  /** Most recent job for this project (or undefined if none). */
  latestJob?: JobRow | null;
  /** Index runs for the project (ordered by creation time). */
  indexRuns: IndexRunRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatCost(costUsd: string | null | undefined): string {
  if (!costUsd) return "--";
  const num = parseFloat(costUsd);
  return isNaN(num) ? "--" : `$${num.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// Fragment
// ---------------------------------------------------------------------------

/**
 * Render the job progress fragment.
 *
 * When a job is running or pending, includes hx-trigger="every 3s"
 * to poll for updates. Otherwise, renders as static content.
 */
export function jobProgressFragment(data: JobProgressData): string {
  const { projectId, latestJob, indexRuns } = data;

  if (!latestJob) {
    return `<div id="job-progress" class="mb-6">
  <p class="text-sm text-slate-400">No jobs have been run for this project yet.</p>
</div>`;
  }

  const isActive = latestJob.status === "pending" || latestJob.status === "running";
  const pollingAttr = isActive
    ? ` hx-get="/projects/${projectId}/progress" hx-trigger="every 3s" hx-swap="outerHTML"`
    : "";

  // Find the currently running index run (if any)
  const runningRun = indexRuns.find((r) => r.status === "running");
  const latestRun = indexRuns.length > 0 ? indexRuns[indexRuns.length - 1] : null;
  const displayRun = runningRun ?? latestRun;

  // Calculate elapsed time
  let elapsed = "--";
  if (latestJob.startedAt) {
    const endTime = latestJob.completedAt ?? new Date();
    const elapsedMs = endTime.getTime() - new Date(latestJob.startedAt).getTime();
    elapsed = formatDuration(elapsedMs);
  }

  // Build progress details
  const layerHtml = displayRun
    ? `<span class="font-medium text-slate-200">${escapeHtml(displayRun.layer)}</span>`
    : `<span class="text-slate-500">--</span>`;

  const filesHtml = displayRun
    ? `<span class="font-medium text-slate-200">${displayRun.filesProcessed} / ${displayRun.filesTotal}</span>`
    : `<span class="text-slate-500">--</span>`;

  // Total cost from all completed runs
  const totalCost = indexRuns.reduce((sum, r) => {
    if (r.costUsd) {
      const val = parseFloat(r.costUsd);
      return isNaN(val) ? sum : sum + val;
    }
    return sum;
  }, 0);

  const errorHtml = latestJob.status === "failed" && latestJob.error
    ? `<div class="mt-3 rounded-lg border border-red-400/30 bg-red-400/5 px-3 py-2 text-xs text-red-400">
        <span class="font-medium">Error:</span> ${escapeHtml(latestJob.error)}
      </div>`
    : "";

  return `<div id="job-progress" class="mb-6"${pollingAttr}>
  <div class="rounded-xl border border-slate-700 bg-slate-800 p-5">
    <div class="flex items-center gap-3 mb-4">
      <span class="text-sm font-medium text-slate-300">Latest Job:</span>
      ${statusBadge(latestJob.status)}
      <span class="text-xs text-slate-400">${escapeHtml(latestJob.type)}</span>
      ${isActive ? `<span class="text-xs text-purple-400 animate-pulse">polling...</span>` : ""}
    </div>
    <div class="flex gap-6 flex-wrap text-sm">
      <div class="space-y-0.5">
        <p class="text-xs text-slate-500 uppercase tracking-wider">Layer</p>
        <p>${layerHtml}</p>
      </div>
      <div class="space-y-0.5">
        <p class="text-xs text-slate-500 uppercase tracking-wider">Files</p>
        <p>${filesHtml}</p>
      </div>
      <div class="space-y-0.5">
        <p class="text-xs text-slate-500 uppercase tracking-wider">Elapsed</p>
        <p class="font-medium text-slate-200">${escapeHtml(elapsed)}</p>
      </div>
      <div class="space-y-0.5">
        <p class="text-xs text-slate-500 uppercase tracking-wider">Cost</p>
        <p class="font-medium text-slate-200 font-mono">${totalCost > 0 ? formatCost(totalCost.toFixed(4)) : "--"}</p>
      </div>
    </div>
    ${errorHtml}
  </div>
</div>`;
}
