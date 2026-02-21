/**
 * Blueprints views — hierarchical blueprint plans with phase accordion.
 */

import { layout } from "./layout.js";
import { escapeHtml, card, badge, type BadgeVariant } from "./components.js";
import type { Risk } from "../../blueprint/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanListItem {
  id: number;
  title: string;
  goal: string | null;
  summary: string | null;
  model: string | null;
  costUsd: string | null;
  createdAt: Date;
}

export interface MilestoneViewData {
  id: number;
  milestoneOrder: number;
  title: string;
  intent: string | null;
  keyFiles: string[] | null;
  verification: string | null;
  details: string | null;
}

export interface PhaseViewData {
  id: number;
  phaseOrder: number;
  title: string;
  intent: string | null;
  milestoneCount: number | null;
  model: string | null;
  costUsd: string | null;
  milestones: MilestoneViewData[];
}

export interface PlanViewData {
  id: number;
  title: string;
  goal: string | null;
  summary: string | null;
  nonGoals: string[] | null;
  acceptanceCriteria: string[] | null;
  risks: Risk[] | null;
  model: string | null;
  costUsd: string | null;
  createdAt: Date;
}

export interface BlueprintsListPageData {
  projectId: number;
  projectName: string;
  plans: PlanListItem[];
  userName: string;
}

export interface BlueprintDetailPageData {
  projectId: number;
  projectName: string;
  plan: PlanViewData;
  phases: PhaseViewData[];
  userName: string;
}

// ---------------------------------------------------------------------------
// Plans list page
// ---------------------------------------------------------------------------

export function blueprintsListPage(data: BlueprintsListPageData): string {
  return layout({
    title: `${data.projectName} — Blueprints`,
    content: blueprintsListContent(data),
    userName: data.userName,
    activeNav: `project-${data.projectId}`,
  });
}

export function blueprintsListFragment(data: BlueprintsListPageData): string {
  return blueprintsListContent(data);
}

function blueprintsListContent(data: BlueprintsListPageData): string {
  const { projectId, projectName, plans } = data;

  let html = `
<div style="margin-bottom:16px;font-size:0.875rem;">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true">${escapeHtml(projectName)}</a>
  <span style="color:#9ca3af;"> / </span>
  <span style="color:#6b7280;">Blueprints</span>
</div>
<h1 class="page-title">Blueprints (${plans.length})</h1>`;

  if (plans.length === 0) {
    html += `<p style="color:#6b7280;">No blueprints yet. Run <code>prism blueprint</code> to generate a hierarchical redesign plan.</p>`;
  } else {
    html += `
<div style="margin-bottom:16px;">
  <a href="/projects/${projectId}/blueprints/export?format=md"
     style="display:inline-block;padding:6px 16px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-size:0.875rem;font-weight:500;">
    Download All (Markdown)
  </a>
</div>`;
    for (const plan of plans) {
      const costInfo = plan.costUsd
        ? `<span style="float:right;font-size:0.75rem;color:#9ca3af;">$${escapeHtml(plan.costUsd)}</span>`
        : "";

      const summaryHtml = plan.summary
        ? `<p style="margin:8px 0;color:#374151;font-size:0.875rem;">${escapeHtml(truncate(plan.summary, 200))}</p>`
        : "";

      const goalHtml = plan.goal
        ? `<p style="margin:4px 0;font-size:0.8125rem;color:#6b7280;">Goal: ${escapeHtml(plan.goal)}</p>`
        : "";

      html += `
<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px;cursor:pointer;"
     hx-get="/projects/${projectId}/blueprints/${plan.id}"
     hx-target="#main-content"
     hx-push-url="true">
  <h3 style="margin:0 0 8px 0;font-size:1rem;font-weight:600;color:#111827;">
    ${escapeHtml(plan.title)} ${costInfo}
  </h3>
  ${goalHtml}
  ${summaryHtml}
  <div style="font-size:0.75rem;color:#9ca3af;margin-top:8px;">
    Created: ${plan.createdAt.toLocaleDateString()}
  </div>
</div>`;
    }
  }

  return html;
}

// ---------------------------------------------------------------------------
// Plan detail page (phases + milestones accordion)
// ---------------------------------------------------------------------------

export function blueprintDetailPage(data: BlueprintDetailPageData): string {
  return layout({
    title: `${data.projectName} — ${data.plan.title}`,
    content: blueprintDetailContent(data),
    userName: data.userName,
    activeNav: `project-${data.projectId}`,
  });
}

export function blueprintDetailFragment(data: BlueprintDetailPageData): string {
  return blueprintDetailContent(data);
}

function blueprintDetailContent(data: BlueprintDetailPageData): string {
  const { projectId, projectName, plan, phases } = data;

  const totalMilestones = phases.reduce((n, p) => n + p.milestones.length, 0);

  let html = `
<div style="margin-bottom:16px;font-size:0.875rem;">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true">${escapeHtml(projectName)}</a>
  <span style="color:#9ca3af;"> / </span>
  <a href="/projects/${projectId}/blueprints"
     hx-get="/projects/${projectId}/blueprints"
     hx-target="#main-content"
     hx-push-url="true">Blueprints</a>
  <span style="color:#9ca3af;"> / </span>
  <span style="color:#6b7280;">${escapeHtml(plan.title)}</span>
</div>

<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
  <h1 class="page-title" style="margin:0;">${escapeHtml(plan.title)}</h1>
  <div style="position:relative;display:inline-block;" class="export-dropdown">
    <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='block'?'none':'block'"
       style="padding:6px 16px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.875rem;font-weight:500;">
      Download &#9662;
    </button>
    <div style="display:none;position:absolute;right:0;top:100%;margin-top:4px;background:#fff;border:1px solid #e5e7eb;border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.1);min-width:160px;z-index:10;">
      <a href="/projects/${projectId}/blueprints/${plan.id}/export?format=md"
         style="display:block;padding:8px 16px;color:#111827;text-decoration:none;font-size:0.875rem;border-bottom:1px solid #f3f4f6;">
        Markdown
      </a>
      <a href="/projects/${projectId}/blueprints/${plan.id}/export?format=json"
         style="display:block;padding:8px 16px;color:#111827;text-decoration:none;font-size:0.875rem;">
        JSON
      </a>
    </div>
  </div>
</div>

<div style="display:flex;gap:16px;margin-bottom:16px;">
  ${statBox("Phases", String(phases.length))}
  ${statBox("Milestones", String(totalMilestones))}
  ${plan.costUsd ? statBox("Cost", `$${plan.costUsd}`) : ""}
  ${plan.model ? statBox("Model", plan.model) : ""}
</div>`;

  // Goal
  if (plan.goal) {
    html += `<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px;margin-bottom:16px;">
      <strong style="color:#1e40af;">Goal:</strong> <span style="color:#1e3a5f;">${escapeHtml(plan.goal)}</span>
    </div>`;
  }

  // Summary
  if (plan.summary) {
    html += card("Summary", `<p style="margin:0;color:#374151;white-space:pre-wrap;font-size:0.875rem;">${escapeHtml(plan.summary)}</p>`);
  }

  // Non-goals
  if (plan.nonGoals && plan.nonGoals.length > 0) {
    html += card("Non-Goals", `<ul style="margin:0;padding-left:20px;">${plan.nonGoals.map((ng) => `<li style="color:#374151;font-size:0.875rem;">${escapeHtml(ng)}</li>`).join("")}</ul>`);
  }

  // Risks
  if (plan.risks && plan.risks.length > 0) {
    const risksHtml = plan.risks.map((r) => {
      const sevBadge = badge(r.severity, riskVariant(r.severity));
      return `<li style="margin-bottom:4px;">${sevBadge} ${escapeHtml(r.risk)} <span style="color:#059669;font-size:0.8125rem;">(${escapeHtml(r.mitigation)})</span></li>`;
    }).join("");
    html += card("Risks", `<ul style="margin:0;padding-left:16px;list-style:disc;">${risksHtml}</ul>`);
  }

  // Phase accordion
  html += `<h2 style="margin:24px 0 12px 0;font-size:1.125rem;font-weight:600;">Phases</h2>`;

  for (const phase of phases) {
    const phaseId = `phase-${phase.id}`;

    html += `
<details style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px;" open>
  <summary style="padding:12px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-weight:600;color:#111827;">
    <span>Phase ${phase.phaseOrder}: ${escapeHtml(phase.title)} ${badge(String(phase.milestones.length) + " milestones", "info")}</span>
    <a href="/blueprints/phases/${phase.id}/export"
       onclick="event.stopPropagation();"
       style="font-size:0.75rem;font-weight:400;color:#2563eb;text-decoration:none;">
      Export
    </a>
  </summary>
  <div style="padding:0 16px 16px 16px;">`;

    if (phase.intent) {
      html += `<p style="color:#6b7280;font-size:0.875rem;margin:0 0 12px 0;">${escapeHtml(phase.intent)}</p>`;
    }

    for (const ms of phase.milestones) {
      html += renderMilestone(ms);
    }

    html += `</div></details>`;
  }

  return html;
}

// ---------------------------------------------------------------------------
// Milestone rendering
// ---------------------------------------------------------------------------

function renderMilestone(ms: MilestoneViewData): string {
  let html = `
<div style="border-left:3px solid #e5e7eb;padding:8px 12px;margin-bottom:12px;">
  <div style="font-weight:600;font-size:0.875rem;color:#111827;margin-bottom:4px;">
    ${ms.milestoneOrder}. ${escapeHtml(ms.title)}
  </div>`;

  if (ms.intent) {
    html += `<p style="margin:0 0 4px 0;color:#4b5563;font-size:0.8125rem;">${escapeHtml(ms.intent)}</p>`;
  }

  if (ms.details) {
    html += `<p style="margin:0 0 4px 0;color:#4b5563;font-size:0.8125rem;white-space:pre-wrap;">${escapeHtml(ms.details)}</p>`;
  }

  if (ms.keyFiles && ms.keyFiles.length > 0) {
    html += `<div style="margin:4px 0;font-size:0.75rem;color:#6b7280;">
      <strong>Key files:</strong> ${ms.keyFiles.map((f) => `<code>${escapeHtml(f)}</code>`).join(", ")}
    </div>`;
  }

  if (ms.verification) {
    html += `<div style="margin:4px 0;font-size:0.75rem;">
      <strong style="color:#6b7280;">Verification:</strong>
      <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:0.75rem;">${escapeHtml(ms.verification)}</code>
    </div>`;
  }

  html += `</div>`;
  return html;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function riskVariant(severity: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    high: "danger",
    medium: "warning",
    low: "info",
  };
  return map[severity] ?? "neutral";
}

function statBox(label: string, value: string): string {
  return `<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;text-align:center;">
    <div style="font-size:1.25rem;font-weight:700;color:#111827;">${escapeHtml(value)}</div>
    <div style="font-size:0.75rem;color:#6b7280;margin-top:2px;">${escapeHtml(label)}</div>
  </div>`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}
