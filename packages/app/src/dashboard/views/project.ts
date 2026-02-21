/**
 * Single project detail page with stats, action buttons, and job progress.
 */

import type { Project, JobRow, IndexRunRow } from "@prism/core";
import { layout } from "./layout.js";
import { escapeHtml, statCard, statusBadge } from "./components.js";
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
<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:24px;">
  <h2 style="font-size:1.125rem;font-weight:600;margin-bottom:12px;">Actions</h2>
  <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
    <button hx-post="/projects/${project.id}/index"
      hx-target="#job-progress"
      hx-swap="outerHTML"
      style="padding:8px 16px;background:#059669;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.875rem;font-weight:600;">
      Index
    </button>
    <button hx-post="/projects/${project.id}/index"
      hx-target="#job-progress"
      hx-swap="outerHTML"
      hx-vals='{"fullReindex": "true"}'
      style="padding:8px 16px;background:#d97706;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.875rem;font-weight:600;">
      Re-index
    </button>
  </div>
  <div style="margin-top:16px;">
    <h3 style="font-size:0.875rem;font-weight:600;color:#6b7280;margin-bottom:8px;">Generate Blueprints</h3>
    <form hx-post="/projects/${project.id}/blueprint"
      hx-target="#job-progress"
      hx-swap="outerHTML"
      style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
      <div style="flex:1;min-width:180px;">
        <label style="display:block;font-size:0.75rem;font-weight:600;color:#6b7280;margin-bottom:4px;">Goal (optional)</label>
        <input type="text" name="goal" placeholder="e.g. Modernize the auth system"
          style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;" />
      </div>
      <div style="flex:1;min-width:180px;">
        <label style="display:block;font-size:0.75rem;font-weight:600;color:#6b7280;margin-bottom:4px;">Focus (optional)</label>
        <input type="text" name="focus" placeholder="e.g. packages/auth/"
          style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;" />
      </div>
      <div>
        <button type="submit"
          style="padding:8px 16px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.875rem;font-weight:600;">
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
<div class="stat-row">
  ${statCard("Files", project.totalFiles ?? 0)}
  ${statCard("Symbols", project.totalSymbols ?? 0)}
  ${statCard("Findings", findingsCount)}
</div>`;

  const details = `
<div style="margin-bottom:24px;">
  <p><strong>Path:</strong> ${escapeHtml(project.path)}</p>
  ${project.gitUrl ? `<p><strong>Git URL:</strong> ${escapeHtml(project.gitUrl)}</p>` : ""}
  <p><strong>Language:</strong> ${escapeHtml(project.language ?? "Unknown")}</p>
  <p><strong>Status:</strong> ${statusBadge(project.indexStatus)}</p>
  <p><strong>Last indexed commit:</strong> ${escapeHtml(project.lastIndexedCommit ?? "\u2014")}</p>
  <p><strong>Updated:</strong> ${escapeHtml(project.updatedAt.toISOString())}</p>
</div>`;

  const nav = `
<div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
  <a href="/projects/${project.id}/files"
     hx-get="/projects/${project.id}/files"
     hx-target="#main-content"
     hx-push-url="true"
     style="padding:8px 16px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-size:0.875rem;">
    Browse Files
  </a>
  <a href="/projects/${project.id}/modules"
     hx-get="/projects/${project.id}/modules"
     hx-target="#main-content"
     hx-push-url="true"
     style="padding:8px 16px;background:#0891b2;color:#fff;border-radius:6px;text-decoration:none;font-size:0.875rem;">
    Modules
  </a>
  <a href="/projects/${project.id}/findings"
     hx-get="/projects/${project.id}/findings"
     hx-target="#main-content"
     hx-push-url="true"
     style="padding:8px 16px;background:#7c3aed;color:#fff;border-radius:6px;text-decoration:none;font-size:0.875rem;">
    View Findings
  </a>
  <a href="/projects/${project.id}/blueprints"
     hx-get="/projects/${project.id}/blueprints"
     hx-target="#main-content"
     hx-push-url="true"
     style="padding:8px 16px;background:#059669;color:#fff;border-radius:6px;text-decoration:none;font-size:0.875rem;">
    Blueprints
  </a>
  <a href="/projects/${project.id}/graph"
     hx-get="/projects/${project.id}/graph"
     hx-target="#main-content"
     hx-push-url="true"
     style="padding:8px 16px;background:#dc2626;color:#fff;border-radius:6px;text-decoration:none;font-size:0.875rem;">
    Dependency Graph
  </a>
</div>`;

  const progress = jobProgressFragment({
    projectId: project.id,
    latestJob: latestJob ?? null,
    indexRuns: indexRuns ?? [],
  });

  const content =
    `<h1 class="page-title">${escapeHtml(project.name)}</h1>` +
    stats +
    details +
    actionButtons(project) +
    progress +
    nav;

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

  return (
    `<h1 class="page-title">${escapeHtml(project.name)}</h1>` +
    `<div class="stat-row">
      ${statCard("Files", project.totalFiles ?? 0)}
      ${statCard("Symbols", project.totalSymbols ?? 0)}
      ${statCard("Findings", findingsCount)}
    </div>` +
    actionButtons(project) +
    progress +
    `<div style="display:flex;gap:12px;margin-top:16px;flex-wrap:wrap;">
      <a href="/projects/${project.id}/files"
         hx-get="/projects/${project.id}/files"
         hx-target="#main-content"
         hx-push-url="true"
         style="padding:8px 16px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-size:0.875rem;">
        Browse Files
      </a>
      <a href="/projects/${project.id}/findings"
         hx-get="/projects/${project.id}/findings"
         hx-target="#main-content"
         hx-push-url="true"
         style="padding:8px 16px;background:#7c3aed;color:#fff;border-radius:6px;text-decoration:none;font-size:0.875rem;">
        View Findings
      </a>
    </div>`
  );
}
