/**
 * Job progress HTMX polling fragment.
 *
 * Shows the latest job status, a layer-by-layer overview,
 * elapsed time, and cost.
 * Polls every 3s when a job is running or pending.
 */

import type { JobRow, IndexRunRow } from "@prism/core";
import { escapeHtml } from "./components.js";

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
// Constants
// ---------------------------------------------------------------------------

const LAYER_ORDER = ["structural", "docs", "semantic", "analysis", "blueprint"] as const;

const LAYER_LABELS: Record<string, string> = {
  structural: "Structural",
  docs: "Docs",
  semantic: "Semantic",
  analysis: "Analysis",
  blueprint: "Blueprint",
};

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

/** Render a single layer row. */
function layerRow(layer: string, run: IndexRunRow | undefined, isActive: boolean): string {
  const label = LAYER_LABELS[layer] ?? layer;

  if (!run) {
    // Not started yet
    return `
  <div class="flex items-center gap-3 py-2">
    <div class="w-5 h-5 rounded-full border-2 border-slate-600 flex-shrink-0"></div>
    <span class="text-sm text-slate-500 w-24">${escapeHtml(label)}</span>
    <span class="text-xs text-slate-600">—</span>
  </div>`;
  }

  const { status, filesProcessed, filesTotal, durationMs } = run;

  let icon: string;
  if (status === "completed") {
    icon = `<div class="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
      <svg class="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
      </svg>
    </div>`;
  } else if (status === "running") {
    icon = `<div class="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 ${isActive ? "animate-pulse" : ""}">
      <div class="w-2 h-2 rounded-full bg-blue-400"></div>
    </div>`;
  } else if (status === "failed") {
    icon = `<div class="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
      <svg class="w-3 h-3 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
      </svg>
    </div>`;
  } else {
    icon = `<div class="w-5 h-5 rounded-full border-2 border-slate-600 flex-shrink-0"></div>`;
  }

  const labelClass = status === "running"
    ? "text-sm text-slate-200 w-24 font-medium"
    : status === "completed"
    ? "text-sm text-slate-300 w-24"
    : status === "failed"
    ? "text-sm text-red-400 w-24"
    : "text-sm text-slate-500 w-24";

  let progressText = "";
  if (filesTotal != null && filesTotal > 0) {
    progressText = `<span class="text-xs text-slate-400 font-mono w-20">${filesProcessed} / ${filesTotal}</span>`;
  } else if (filesProcessed != null && filesProcessed > 0) {
    progressText = `<span class="text-xs text-slate-400 font-mono w-20">${filesProcessed}</span>`;
  } else if (status === "running") {
    progressText = `<span class="text-xs text-slate-500 w-20">running…</span>`;
  } else {
    progressText = `<span class="text-xs text-slate-600 w-20">—</span>`;
  }

  let durationText = "";
  if (status === "running" && run.startedAt) {
    const elapsed = Math.floor((Date.now() - new Date(run.startedAt).getTime()) / 1000);
    durationText = `<span class="text-xs text-blue-400">${formatDuration(elapsed * 1000)}</span>`;
  } else if (durationMs != null && durationMs > 0) {
    const durationClass = status === "completed" ? "text-slate-500" : "text-slate-500";
    durationText = `<span class="text-xs ${durationClass}">${formatDuration(durationMs)}</span>`;
  }

  // Progress bar for running layer with known total
  let progressBar = "";
  if (status === "running" && filesTotal != null && filesTotal > 0) {
    const pct = Math.min(100, Math.round((filesProcessed ?? 0) / filesTotal * 100));
    progressBar = `
    <div class="mt-1 ml-8 h-1 w-full max-w-[200px] rounded-full bg-slate-700">
      <div class="h-1 rounded-full bg-blue-500 transition-all duration-500" style="width: ${pct}%"></div>
    </div>`;
  }

  return `
  <div>
    <div class="flex items-center gap-3 py-2">
      ${icon}
      <span class="${labelClass}">${escapeHtml(label)}</span>
      ${progressText}
      ${durationText}
    </div>${progressBar}
  </div>`;
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

  // Calculate elapsed time
  let elapsed = "--";
  if (latestJob.startedAt) {
    const endTime = latestJob.completedAt ?? new Date();
    const elapsedMs = endTime.getTime() - new Date(latestJob.startedAt).getTime();
    elapsed = formatDuration(elapsedMs);
  }

  // Total cost from all runs
  const totalCost = indexRuns.reduce((sum, r) => {
    if (r.costUsd) {
      const val = parseFloat(r.costUsd);
      return isNaN(val) ? sum : sum + val;
    }
    return sum;
  }, 0);

  // Get most recent run per layer (runs are ordered by creation time, last wins)
  const byLayer = new Map<string, IndexRunRow>();
  for (const run of indexRuns) {
    byLayer.set(run.layer, run);
  }

  // Status badge colours
  const statusColours: Record<string, string> = {
    completed: "text-emerald-400",
    running:   "text-blue-400",
    failed:    "text-red-400",
    pending:   "text-slate-400",
  };
  const statusColour = statusColours[latestJob.status] ?? "text-slate-400";

  const errorHtml = latestJob.status === "failed" && latestJob.error
    ? `<div class="mt-3 rounded-lg border border-red-400/30 bg-red-400/5 px-3 py-2 text-xs text-red-400">
        <span class="font-medium">Error:</span> ${escapeHtml(latestJob.error)}
      </div>`
    : "";

  const layers = LAYER_ORDER.map((layer) =>
    layerRow(layer, byLayer.get(layer), isActive),
  ).join("");

  return `<div id="job-progress" class="mb-6"${pollingAttr}>
  <div class="rounded-xl border border-slate-700 bg-slate-800 p-5">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <span class="text-sm font-medium text-slate-300">Latest Job</span>
        <span class="text-xs font-semibold uppercase tracking-wide ${statusColour}">${escapeHtml(latestJob.status)}</span>
        ${isActive ? `<span class="text-xs text-slate-500 animate-pulse">polling…</span>` : ""}
      </div>
      <div class="flex items-center gap-4 text-xs text-slate-400">
        <span>${escapeHtml(elapsed)}</span>
        ${totalCost > 0 ? `<span class="font-mono">${formatCost(totalCost.toFixed(4))}</span>` : ""}
      </div>
    </div>
    <div class="divide-y divide-slate-700/50">
      ${layers}
    </div>
    ${errorHtml}
  </div>
</div>`;
}
