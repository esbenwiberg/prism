/**
 * Single project detail page with stats, action buttons, and job progress.
 */

import type { Project, JobRow, IndexRunRow } from "@prism/core";
import { layout } from "./layout.js";
import { escapeHtml, statCard, statusBadge, projectTabNav } from "./components.js";
import { jobProgressFragment } from "./job-progress.js";

export interface ProjectPageData {
  project: Project;
  findingsCount: number;
  userName: string;
  /** Latest job for progress display (optional for backward compat). */
  latestJob?: JobRow | null;
  /** Index runs for progress display (optional for backward compat). */
  indexRuns?: IndexRunRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Render the action buttons section (Index, Re-index, Generate Blueprints).
 */
function actionButtons(project: Project): string {
  return `
<div class="rounded-xl border border-slate-700 bg-slate-800 p-6 mb-6">
  <h2 class="text-base font-semibold text-slate-50 mb-4">Actions</h2>
  <div class="flex gap-3 flex-wrap items-end">
    <button hx-post="/projects/${project.id}/index"
      hx-target="#job-progress"
      hx-swap="outerHTML"
      class="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-400">
      Index
    </button>
    <button hx-post="/projects/${project.id}/index"
      hx-target="#job-progress"
      hx-swap="outerHTML"
      hx-vals='{"fullReindex": "true"}'
      class="inline-flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-50">
      Re-index
    </button>
  </div>
  <div class="mt-5">
    <h3 class="text-xs font-medium uppercase tracking-wider text-slate-400 mb-3">Generate Blueprints</h3>
    <form hx-post="/projects/${project.id}/blueprint"
      hx-target="#job-progress"
      hx-swap="outerHTML"
      class="flex gap-3 flex-wrap items-end">
      <div class="flex-1 min-w-[180px] space-y-1.5">
        <label class="block text-sm font-medium text-slate-300">Goal <span class="text-slate-500">(optional)</span></label>
        <input type="text" name="goal" placeholder="e.g. Modernize the auth system"
          class="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
      </div>
      <div class="flex-1 min-w-[180px] space-y-1.5">
        <label class="block text-sm font-medium text-slate-300">Focus <span class="text-slate-500">(optional)</span></label>
        <input type="text" name="focus" placeholder="e.g. packages/auth/"
          class="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
      </div>
      <div>
        <button type="submit"
          class="inline-flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-400">
          Generate
        </button>
      </div>
    </form>
  </div>
</div>`;
}

/**
 * Render the full project detail page.
 */
export function projectPage(data: ProjectPageData): string {
  const { project, findingsCount, userName, latestJob, indexRuns } = data;

  const stats = `
<div class="flex gap-4 flex-wrap mb-6">
  ${statCard("Files", project.totalFiles ?? 0)}
  ${statCard("Symbols", project.totalSymbols ?? 0)}
  ${statCard("Findings", findingsCount)}
</div>`;

  const details = `
<div class="rounded-xl border border-slate-700 bg-slate-800 p-6 mb-6 space-y-2 text-sm">
  <p class="text-slate-300"><span class="font-medium text-slate-400">Path:</span> <span class="font-mono text-xs">${escapeHtml(project.path)}</span></p>
  ${project.gitUrl ? `<p class="text-slate-300"><span class="font-medium text-slate-400">Git URL:</span> <span class="font-mono text-xs">${escapeHtml(project.gitUrl)}</span></p>` : ""}
  <p class="text-slate-300"><span class="font-medium text-slate-400">Language:</span> ${escapeHtml(project.language ?? "Unknown")}</p>
  <p class="text-slate-300"><span class="font-medium text-slate-400">Status:</span> ${statusBadge(project.indexStatus)}</p>
  <p class="text-slate-300"><span class="font-medium text-slate-400">Last indexed commit:</span> <span class="font-mono text-xs">${escapeHtml(project.lastIndexedCommit ?? "\u2014")}</span></p>
  <p class="text-slate-300"><span class="font-medium text-slate-400">Updated:</span> ${escapeHtml(project.updatedAt.toISOString())}</p>
</div>`;


  const progress = jobProgressFragment({
    projectId: project.id,
    latestJob: latestJob ?? null,
    indexRuns: indexRuns ?? [],
  });

  const content =
    projectTabNav(project.id, project.name, "overview") +
    stats +
    details +
    actionButtons(project) +
    progress;

  return layout({
    title: project.name,
    content,
    userName,
    activeNav: `project-${project.id}`,
  });
}

/**
 * Render just the content fragment (for HTMX partial updates).
 */
export function projectFragment(data: ProjectPageData): string {
  const { project, findingsCount, latestJob, indexRuns } = data;

  const progress = jobProgressFragment({
    projectId: project.id,
    latestJob: latestJob ?? null,
    indexRuns: indexRuns ?? [],
  });

  const details = `
<div class="rounded-xl border border-slate-700 bg-slate-800 p-6 mb-6 space-y-2 text-sm">
  <p class="text-slate-300"><span class="font-medium text-slate-400">Path:</span> <span class="font-mono text-xs">${escapeHtml(project.path)}</span></p>
  ${project.gitUrl ? `<p class="text-slate-300"><span class="font-medium text-slate-400">Git URL:</span> <span class="font-mono text-xs">${escapeHtml(project.gitUrl)}</span></p>` : ""}
  <p class="text-slate-300"><span class="font-medium text-slate-400">Language:</span> ${escapeHtml(project.language ?? "Unknown")}</p>
  <p class="text-slate-300"><span class="font-medium text-slate-400">Status:</span> ${statusBadge(project.indexStatus)}</p>
  <p class="text-slate-300"><span class="font-medium text-slate-400">Last indexed commit:</span> <span class="font-mono text-xs">${escapeHtml(project.lastIndexedCommit ?? "\u2014")}</span></p>
  <p class="text-slate-300"><span class="font-medium text-slate-400">Updated:</span> ${escapeHtml(project.updatedAt.toISOString())}</p>
</div>`;

  return (
    projectTabNav(project.id, project.name, "overview") +
    `<div class="flex gap-4 flex-wrap mb-6">
      ${statCard("Files", project.totalFiles ?? 0)}
      ${statCard("Symbols", project.totalSymbols ?? 0)}
      ${statCard("Findings", findingsCount)}
    </div>` +
    details +
    actionButtons(project) +
    progress
  );
}
