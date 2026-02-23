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

  let html = breadcrumb(projectId, projectName, "Blueprints") +
    `<h2 class="text-2xl font-bold text-slate-50 mb-6">Blueprints (${plans.length})</h2>`;

  if (plans.length === 0) {
    html += `<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-12">
      <p class="text-sm text-slate-400">No blueprints yet. Run <code class="font-mono text-xs">prism blueprint</code> to generate a hierarchical redesign plan.</p>
    </div>`;
  } else {
    html += `<div class="mb-6">
  <a href="/projects/${projectId}/blueprints/export?format=md"
     class="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-600 hover:text-slate-50">
    Download All (Markdown)
  </a>
</div>`;

    for (const plan of plans) {
      const costInfo = plan.costUsd
        ? `<span class="text-xs text-slate-500 font-mono">$${escapeHtml(plan.costUsd)}</span>`
        : "";

      const summaryHtml = plan.summary
        ? `<p class="mt-2 text-sm text-slate-300">${escapeHtml(truncate(plan.summary, 200))}</p>`
        : "";

      const goalHtml = plan.goal
        ? `<p class="mt-1 text-xs text-slate-400">Goal: ${escapeHtml(plan.goal)}</p>`
        : "";

      html += `
<div class="rounded-xl border border-slate-700 bg-slate-800 p-6 mb-4 cursor-pointer hover:border-slate-600 transition-colors"
     hx-get="/projects/${projectId}/blueprints/${plan.id}"
     hx-target="#main-content"
     hx-push-url="true">
  <div class="flex items-start justify-between gap-4">
    <h3 class="text-base font-semibold text-slate-50">${escapeHtml(plan.title)}</h3>
    ${costInfo}
  </div>
  ${goalHtml}
  ${summaryHtml}
  <div class="mt-3 text-xs text-slate-500">
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

  let html = breadcrumb(projectId, projectName, "Blueprints", plan.title, projectId) + `
<div class="flex justify-between items-center mb-6">
  <h2 class="text-2xl font-bold text-slate-50">${escapeHtml(plan.title)}</h2>
  <div class="relative export-dropdown">
    <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='block'?'none':'block'"
       class="inline-flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-600 hover:text-slate-50">
      Download &#9662;
    </button>
    <div style="display:none" class="absolute right-0 top-full mt-1 rounded-xl border border-slate-700 bg-slate-800 shadow-xl min-w-[160px] z-10 overflow-hidden">
      <a href="/projects/${projectId}/blueprints/${plan.id}/export?format=md"
         class="block px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-50 transition-colors border-b border-slate-700">
        Markdown
      </a>
      <a href="/projects/${projectId}/blueprints/${plan.id}/export?format=json"
         class="block px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-50 transition-colors">
        JSON
      </a>
    </div>
  </div>
</div>

<div class="flex gap-4 mb-6 flex-wrap">
  ${statBox("Phases", String(phases.length))}
  ${statBox("Milestones", String(totalMilestones))}
  ${plan.costUsd ? statBox("Cost", `$${plan.costUsd}`) : ""}
  ${plan.model ? statBox("Model", plan.model) : ""}
</div>`;

  // Goal
  if (plan.goal) {
    html += `<div class="rounded-xl border border-purple-500/30 bg-purple-500/5 px-4 py-3 mb-4">
      <span class="text-sm font-medium text-purple-400">Goal:</span>
      <span class="ml-2 text-sm text-slate-300">${escapeHtml(plan.goal)}</span>
    </div>`;
  }

  // Summary
  if (plan.summary) {
    html += card("Summary", `<p class="text-sm text-slate-300 whitespace-pre-wrap">${escapeHtml(plan.summary)}</p>`);
  }

  // Non-goals
  if (plan.nonGoals && plan.nonGoals.length > 0) {
    html += card("Non-Goals", `<ul class="space-y-1 list-disc list-inside">${plan.nonGoals.map((ng) => `<li class="text-sm text-slate-300">${escapeHtml(ng)}</li>`).join("")}</ul>`);
  }

  // Risks
  if (plan.risks && plan.risks.length > 0) {
    const risksHtml = plan.risks.map((r) => {
      const sevBadge = badge(r.severity, riskVariant(r.severity));
      return `<li class="flex items-start gap-2 text-sm">${sevBadge} <span class="text-slate-300">${escapeHtml(r.risk)}</span> <span class="text-emerald-400 text-xs">(${escapeHtml(r.mitigation)})</span></li>`;
    }).join("");
    html += card("Risks", `<ul class="space-y-2">${risksHtml}</ul>`);
  }

  // Phase accordion
  html += `<h3 class="mt-6 mb-4 text-lg font-semibold text-slate-50">Phases</h3>`;

  for (const phase of phases) {
    html += `
<details class="rounded-xl border border-slate-700 bg-slate-800 mb-3" open>
  <summary class="flex justify-between items-center px-5 py-4 cursor-pointer font-semibold text-slate-50 list-none hover:bg-slate-700/50 transition-colors rounded-xl">
    <span class="flex items-center gap-3">
      Phase ${phase.phaseOrder}: ${escapeHtml(phase.title)}
      ${badge(String(phase.milestones.length) + " milestones", "info")}
    </span>
    <a href="/blueprints/phases/${phase.id}/export"
       onclick="event.stopPropagation();"
       class="text-xs font-normal text-purple-400 hover:text-purple-300">
      Export
    </a>
  </summary>
  <div class="px-5 pb-5">`;

    if (phase.intent) {
      html += `<p class="text-sm text-slate-400 mb-4">${escapeHtml(phase.intent)}</p>`;
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
<div class="border-l-2 border-slate-600 pl-4 mb-4">
  <div class="text-sm font-semibold text-slate-200 mb-1">
    ${ms.milestoneOrder}. ${escapeHtml(ms.title)}
  </div>`;

  if (ms.intent) {
    html += `<p class="text-xs text-slate-400 mb-1">${escapeHtml(ms.intent)}</p>`;
  }

  if (ms.details) {
    html += `<p class="text-xs text-slate-400 mb-1 whitespace-pre-wrap">${escapeHtml(ms.details)}</p>`;
  }

  if (ms.keyFiles && ms.keyFiles.length > 0) {
    html += `<div class="mt-1 text-xs text-slate-400">
      <span class="font-medium">Key files:</span> ${ms.keyFiles.map((f) => `<code class="font-mono bg-slate-900 px-1.5 py-0.5 rounded text-slate-300">${escapeHtml(f)}</code>`).join(", ")}
    </div>`;
  }

  if (ms.verification) {
    html += `<div class="mt-1 text-xs">
      <span class="font-medium text-slate-400">Verification:</span>
      <code class="font-mono bg-slate-900 px-1.5 py-0.5 rounded text-slate-300 ml-1">${escapeHtml(ms.verification)}</code>
    </div>`;
  }

  html += `</div>`;
  return html;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function breadcrumb(
  projectId: number,
  projectName: string,
  section?: string,
  detail?: string,
  _detailProjectId?: number,
): string {
  const parts: string[] = [
    `<a href="/projects/${projectId}" hx-get="/projects/${projectId}" hx-target="#main-content" hx-push-url="true" class="text-purple-400 hover:text-purple-300">${escapeHtml(projectName)}</a>`,
  ];
  if (section && !detail) {
    parts.push(`<span class="text-slate-600">/</span><span class="text-slate-400">${escapeHtml(section)}</span>`);
  } else if (section && detail) {
    parts.push(
      `<span class="text-slate-600">/</span><a href="/projects/${projectId}/blueprints" hx-get="/projects/${projectId}/blueprints" hx-target="#main-content" hx-push-url="true" class="text-purple-400 hover:text-purple-300">${escapeHtml(section)}</a>`,
      `<span class="text-slate-600">/</span><span class="text-slate-400">${escapeHtml(detail)}</span>`,
    );
  }
  return `<div class="mb-4 flex items-center gap-1.5 text-sm">${parts.join("")}</div>`;
}

function riskVariant(severity: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    high: "danger",
    medium: "warning",
    low: "info",
  };
  return map[severity] ?? "neutral";
}

function statBox(label: string, value: string): string {
  return `<div class="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-center">
    <div class="text-lg font-semibold text-slate-50">${escapeHtml(value)}</div>
    <div class="mt-0.5 text-xs text-slate-400">${escapeHtml(label)}</div>
  </div>`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}
