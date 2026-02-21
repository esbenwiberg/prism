/**
 * Blueprints view — lists blueprint proposals with full details.
 */

import { layout } from "./layout.js";
import { escapeHtml, card, badge, type BadgeVariant } from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BlueprintViewData {
  id: number;
  title: string;
  subsystem: string | null;
  summary: string | null;
  proposedArchitecture: string | null;
  moduleChanges: unknown;
  migrationPath: string | null;
  risks: unknown;
  rationale: string | null;
  model: string | null;
  costUsd: string | null;
}

export interface BlueprintsPageData {
  projectId: number;
  projectName: string;
  blueprints: BlueprintViewData[];
  userName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderModuleChanges(changes: unknown): string {
  if (!Array.isArray(changes) || changes.length === 0) return "<em>None</em>";

  return `<ul style="margin:0;padding-left:16px;list-style:disc;">
    ${(changes as Array<{ module?: string; action?: string; description?: string }>)
      .map((c) => {
        const actionBadge = badge(c.action ?? "modify", actionVariant(c.action ?? "modify"));
        return `<li style="margin-bottom:4px;">${actionBadge} <strong>${escapeHtml(c.module ?? "unknown")}</strong> — ${escapeHtml(c.description ?? "")}</li>`;
      })
      .join("")}
  </ul>`;
}

function renderRisks(risks: unknown): string {
  if (!Array.isArray(risks) || risks.length === 0) return "<em>No risks identified</em>";

  return `<ul style="margin:0;padding-left:16px;list-style:disc;">
    ${(risks as Array<{ risk?: string; severity?: string; mitigation?: string }>)
      .map((r) => {
        const sevBadge = badge(r.severity ?? "low", riskVariant(r.severity ?? "low"));
        return `<li style="margin-bottom:4px;">${sevBadge} ${escapeHtml(r.risk ?? "")} <span style="color:#059669;font-size:0.8125rem;">(Mitigation: ${escapeHtml(r.mitigation ?? "N/A")})</span></li>`;
      })
      .join("")}
  </ul>`;
}

function actionVariant(action: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    add: "success",
    modify: "info",
    remove: "danger",
    move: "warning",
  };
  return map[action] ?? "neutral";
}

function riskVariant(severity: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    high: "danger",
    medium: "warning",
    low: "info",
  };
  return map[severity] ?? "neutral";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Render the full blueprints page.
 */
export function blueprintsPage(data: BlueprintsPageData): string {
  const { projectId, projectName, blueprints, userName } = data;

  const breadcrumb = `
<div style="margin-bottom:16px;font-size:0.875rem;">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true">${escapeHtml(projectName)}</a>
  <span style="color:#9ca3af;"> / </span>
  <span style="color:#6b7280;">Blueprints</span>
</div>`;

  let content =
    breadcrumb +
    `<h1 class="page-title">Blueprints (${blueprints.length})</h1>`;

  if (blueprints.length === 0) {
    content += `<p style="color:#6b7280;">No blueprints yet. Run <code>prism blueprint</code> to generate redesign proposals.</p>`;
  } else {
    for (const bp of blueprints) {
      const subsystemBadge = bp.subsystem
        ? badge(bp.subsystem, "info")
        : "";

      const summaryHtml = bp.summary
        ? `<p style="margin:8px 0;color:#374151;">${escapeHtml(bp.summary)}</p>`
        : "";

      const architectureHtml = bp.proposedArchitecture
        ? `<div style="margin-top:12px;">
            <strong>Proposed Architecture:</strong>
            <p style="margin:4px 0;color:#4b5563;white-space:pre-wrap;font-size:0.875rem;">${escapeHtml(bp.proposedArchitecture)}</p>
          </div>`
        : "";

      const changesHtml = `<div style="margin-top:12px;">
        <strong>Module Changes:</strong>
        ${renderModuleChanges(bp.moduleChanges)}
      </div>`;

      const migrationHtml = bp.migrationPath
        ? `<div style="margin-top:12px;">
            <strong>Migration Path:</strong>
            <p style="margin:4px 0;color:#4b5563;white-space:pre-wrap;font-size:0.875rem;">${escapeHtml(bp.migrationPath)}</p>
          </div>`
        : "";

      const risksHtml = `<div style="margin-top:12px;">
        <strong>Risks:</strong>
        ${renderRisks(bp.risks)}
      </div>`;

      const rationaleHtml = bp.rationale
        ? `<div style="margin-top:12px;">
            <strong>Rationale:</strong>
            <p style="margin:4px 0;color:#4b5563;font-size:0.875rem;">${escapeHtml(bp.rationale)}</p>
          </div>`
        : "";

      const costInfo = bp.costUsd
        ? `<span style="float:right;font-size:0.75rem;color:#9ca3af;">Cost: $${escapeHtml(bp.costUsd)} | Model: ${escapeHtml(bp.model ?? "unknown")}</span>`
        : "";

      content += card(
        `${escapeHtml(bp.title)} ${subsystemBadge} ${costInfo}`,
        summaryHtml + architectureHtml + changesHtml + migrationHtml + risksHtml + rationaleHtml,
      );
    }
  }

  return layout({
    title: `${projectName} — Blueprints`,
    content,
    userName,
    activeNav: `project-${projectId}`,
  });
}

/**
 * Render just the content fragment (for HTMX partial updates).
 */
export function blueprintsFragment(data: BlueprintsPageData): string {
  const { projectId, projectName, blueprints } = data;

  let content = `
<div style="margin-bottom:16px;font-size:0.875rem;">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true">${escapeHtml(projectName)}</a>
  <span style="color:#9ca3af;"> / </span>
  <span style="color:#6b7280;">Blueprints</span>
</div>
<h1 class="page-title">Blueprints (${blueprints.length})</h1>`;

  if (blueprints.length === 0) {
    content += `<p style="color:#6b7280;">No blueprints yet.</p>`;
  } else {
    for (const bp of blueprints) {
      content += card(
        escapeHtml(bp.title),
        bp.summary ? `<p>${escapeHtml(bp.summary)}</p>` : "",
      );
    }
  }

  return content;
}
