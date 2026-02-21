/**
 * Single project detail page with stats.
 */

import type { Project } from "@prism/core";
import { layout } from "./layout.js";
import { escapeHtml, statCard, statusBadge } from "./components.js";

export interface ProjectPageData {
  project: Project;
  findingsCount: number;
  userName: string;
}

/**
 * Render the full project detail page.
 */
export function projectPage(data: ProjectPageData): string {
  const { project, findingsCount, userName } = data;

  const stats = `
<div class="stat-row">
  ${statCard("Files", project.totalFiles ?? 0)}
  ${statCard("Symbols", project.totalSymbols ?? 0)}
  ${statCard("Findings", findingsCount)}
</div>`;

  const details = `
<div style="margin-bottom:24px;">
  <p><strong>Path:</strong> ${escapeHtml(project.path)}</p>
  <p><strong>Language:</strong> ${escapeHtml(project.language ?? "Unknown")}</p>
  <p><strong>Status:</strong> ${statusBadge(project.indexStatus)}</p>
  <p><strong>Last indexed commit:</strong> ${escapeHtml(project.lastIndexedCommit ?? "—")}</p>
  <p><strong>Updated:</strong> ${escapeHtml(project.updatedAt.toISOString())}</p>
</div>`;

  const nav = `
<div style="display:flex;gap:12px;margin-bottom:24px;">
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
</div>`;

  const content =
    `<h1 class="page-title">${escapeHtml(project.name)}</h1>` +
    stats +
    details +
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
  const { project, findingsCount } = data;

  return (
    `<h1 class="page-title">${escapeHtml(project.name)}</h1>` +
    `<div class="stat-row">
      ${statCard("Files", project.totalFiles ?? 0)}
      ${statCard("Symbols", project.totalSymbols ?? 0)}
      ${statCard("Findings", findingsCount)}
    </div>` +
    `<div style="display:flex;gap:12px;margin-top:16px;">
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
