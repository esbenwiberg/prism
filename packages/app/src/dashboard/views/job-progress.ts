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
    return `<div id="job-progress">
  <p style="color:#6b7280;font-size:0.875rem;">No jobs have been run for this project yet.</p>
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
    ? `<span style="font-weight:600;">${escapeHtml(displayRun.layer)}</span>`
    : "--";

  const filesHtml = displayRun
    ? `${displayRun.filesProcessed} / ${displayRun.filesTotal}`
    : "--";

  // Total cost from all completed runs
  const totalCost = indexRuns.reduce((sum, r) => {
    if (r.costUsd) {
      const val = parseFloat(r.costUsd);
      return isNaN(val) ? sum : sum + val;
    }
    return sum;
  }, 0);

  const errorHtml = latestJob.status === "failed" && latestJob.error
    ? `<div style="background:#fee2e2;color:#991b1b;padding:8px 12px;border-radius:4px;margin-top:12px;font-size:0.8125rem;">
        <strong>Error:</strong> ${escapeHtml(latestJob.error)}
      </div>`
    : "";

  return `<div id="job-progress"${pollingAttr}>
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
      <strong style="font-size:0.875rem;">Latest Job:</strong>
      ${statusBadge(latestJob.status)}
      <span style="font-size:0.8125rem;color:#6b7280;">${escapeHtml(latestJob.type)}</span>
      ${isActive ? '<span class="loading-indicator" style="font-size:0.75rem;color:#2563eb;">polling...</span>' : ""}
    </div>
    <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:0.8125rem;">
      <div>
        <span style="color:#6b7280;">Layer:</span> ${layerHtml}
      </div>
      <div>
        <span style="color:#6b7280;">Files:</span> ${filesHtml}
      </div>
      <div>
        <span style="color:#6b7280;">Elapsed:</span> ${elapsed}
      </div>
      <div>
        <span style="color:#6b7280;">Cost:</span> ${totalCost > 0 ? formatCost(totalCost.toFixed(4)) : "--"}
      </div>
    </div>
    ${errorHtml}
  </div>
</div>`;
}
