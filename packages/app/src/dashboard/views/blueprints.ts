/**
 * Blueprints views — hierarchical blueprint plans with phase accordion.
 */

import { layout } from "./layout.js";
import { escapeHtml, card, badge, type BadgeVariant } from "./components.js";
import type { Risk } from "../../blueprint/types.js";

// ---------------------------------------------------------------------------
// Chat / proposal types
// ---------------------------------------------------------------------------

export interface ProposedEdit {
  milestoneId: number;
  field: string;
  newValue: string;
}

export interface ChatEntry {
  role: "user" | "assistant";
  content: string;
  proposedEdits?: ProposedEdit[];
  appliedAt?: string;
}

// ---------------------------------------------------------------------------
// View data types
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
  decisions: string[] | null;
}

export interface PhaseViewData {
  id: number;
  phaseOrder: number;
  title: string;
  intent: string | null;
  milestoneCount: number | null;
  model: string | null;
  costUsd: string | null;
  status: string;
  notes: string | null;
  chatHistory: ChatEntry[];
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
    html += renderPhaseCard(phase);
  }

  return html;
}

// ---------------------------------------------------------------------------
// Phase card rendering
// ---------------------------------------------------------------------------

function renderPhaseCard(phase: PhaseViewData): string {
  const isAccepted = phase.status === "accepted";
  const statusBadge = isAccepted
    ? `<span id="phase-status-badge-${phase.id}" class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">ACCEPTED</span>`
    : `<span id="phase-status-badge-${phase.id}" class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/30">DRAFT</span>`;

  const costBadge = phase.costUsd
    ? `<span class="text-xs font-mono text-slate-500">gen: $${escapeHtml(phase.costUsd)}</span>`
    : "";

  const acceptBtn = isAccepted ? "" : `
    <button
      hx-post="/blueprints/phases/${phase.id}/accept"
      hx-target="#phase-status-badge-${phase.id}"
      hx-swap="outerHTML"
      class="text-xs font-medium text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-full px-2.5 py-0.5 transition-colors">
      Accept Phase
    </button>`;

  const discussBtn = `
    <button
      onclick="document.getElementById('chat-panel-${phase.id}').style.display = document.getElementById('chat-panel-${phase.id}').style.display === 'none' ? 'block' : 'none'"
      class="text-xs font-medium text-purple-400 hover:text-purple-300 border border-purple-500/30 rounded-full px-2.5 py-0.5 transition-colors">
      Discuss
    </button>`;

  const hasEmptyMilestones = phase.milestones.some((ms) => !ms.intent && !ms.details);
  const expandBtn = hasEmptyMilestones
    ? `<button
        hx-post="/blueprints/phases/${phase.id}/expand-milestones"
        hx-target="#phase-milestones-${phase.id}"
        hx-swap="innerHTML"
        hx-disabled-elt="this"
        class="group/expbtn inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:text-amber-300 border border-amber-500/30 rounded-full px-2.5 py-0.5 transition-colors disabled:opacity-60 disabled:cursor-wait">
        <span class="group-disabled/expbtn:hidden">Generate descriptions</span>
        <span class="hidden group-disabled/expbtn:inline-flex items-center gap-1.5">
          <svg class="animate-spin h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" class="opacity-25"/>
            <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" class="opacity-75"/>
          </svg>
          Generating…
        </span>
      </button>`
    : "";

  const milestonesHtml = phase.milestones.map((ms) => renderMilestoneCard(ms)).join("");

  return `
<details class="rounded-xl border border-slate-700 bg-slate-800 mb-3" open>
  <summary class="flex justify-between items-center px-5 py-4 cursor-pointer font-semibold text-slate-50 list-none hover:bg-slate-700/50 transition-colors rounded-xl">
    <span class="flex items-center gap-3">
      Phase ${phase.phaseOrder}: ${escapeHtml(phase.title)}
      ${badge(String(phase.milestones.length) + " milestones", "info")}
      ${costBadge}
    </span>
    <a href="/blueprints/phases/${phase.id}/export"
       onclick="event.stopPropagation();"
       class="text-xs font-normal text-purple-400 hover:text-purple-300">
      Export
    </a>
  </summary>
  <div class="px-5 pb-5">
    ${phase.intent ? `<p class="text-sm text-slate-400 mb-4">${escapeHtml(phase.intent)}</p>` : ""}

    <div id="phase-milestones-${phase.id}">
      ${milestonesHtml}
    </div>

    <!-- Phase footer: status + actions -->
    <div class="mt-4 pt-4 border-t border-slate-700 flex items-center gap-3 flex-wrap">
      ${statusBadge}
      ${acceptBtn}
      ${expandBtn}
      ${discussBtn}
    </div>

    <!-- Chat panel (hidden by default) -->
    <div id="chat-panel-${phase.id}" style="display:none" class="mt-4">
      ${renderChatPanel(phase)}
    </div>
  </div>
</details>`;
}

// ---------------------------------------------------------------------------
// Milestone card rendering (exported for use in routes)
// ---------------------------------------------------------------------------

export function renderMilestoneCard(ms: MilestoneViewData): string {
  let html = `
<div id="milestone-card-${ms.id}" class="border-l-2 border-slate-600 pl-4 mb-4">
  <div class="text-sm font-semibold text-slate-200 mb-1">
    ${ms.milestoneOrder}. ${escapeHtml(ms.title)}
  </div>`;

  if (ms.intent) {
    html += `<p class="text-xs text-slate-400 mb-1">${escapeHtml(ms.intent)}</p>`;
  }

  if (ms.details) {
    html += `<p class="text-xs text-slate-400 mb-1 whitespace-pre-wrap">${escapeHtml(ms.details)}</p>`;
  }

  if (!ms.intent && !ms.details) {
    html += `<p class="text-xs text-slate-600 italic mb-1">No description — use Discuss to elaborate on this milestone.</p>`;
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

  if (ms.decisions && ms.decisions.length > 0) {
    const decisionsHtml = ms.decisions
      .map((d) => `<li class="text-slate-300">${escapeHtml(d)}</li>`)
      .join("");
    html += `<div class="mt-2">
      <span class="text-xs font-medium text-slate-400">Decisions:</span>
      <ul class="mt-1 space-y-1 list-disc list-inside text-xs">${decisionsHtml}</ul>
    </div>`;
  }

  html += `</div>`;
  return html;
}

// ---------------------------------------------------------------------------
// Chat panel rendering
// ---------------------------------------------------------------------------

function renderChatPanel(phase: PhaseViewData): string {
  const threadHtml = renderChatThread(phase.id, phase.chatHistory);

  const notesValue = escapeHtml(phase.notes ?? "");

  const chatCostLabel = phase.chatHistory.length > 0
    ? `<span class="text-xs text-slate-500 font-mono">chat est: ${estimateChatCost(phase.chatHistory)}</span>`
    : "";

  return `
<div class="rounded-xl border border-slate-600 bg-slate-900 p-4">
  <div class="flex items-center justify-between mb-3">
    <h4 class="text-sm font-semibold text-slate-300">Discuss with Claude</h4>
    ${chatCostLabel}
  </div>

  <!-- Chat thread -->
  <div id="chat-thread-${phase.id}" class="space-y-3 mb-4 max-h-96 overflow-y-auto">
    ${threadHtml}
  </div>

  <!-- Chat input -->
  <form
    hx-post="/blueprints/phases/${phase.id}/chat"
    hx-target="#chat-thread-${phase.id}"
    hx-swap="innerHTML"
    hx-on::after-request="this.querySelector('textarea').value=''"
    class="flex flex-col gap-2">
    <textarea
      name="message"
      rows="3"
      placeholder="Ask Claude to improve a milestone, explain a decision, or suggest alternatives…"
      class="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-purple-500 focus:outline-none resize-none"></textarea>
    <button type="submit"
      class="self-end inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-500 disabled:opacity-50">
      Send
    </button>
  </form>

  <!-- Notes -->
  <div class="mt-4 pt-4 border-t border-slate-700">
    <label class="text-xs font-medium text-slate-400 block mb-1">Notes</label>
    <textarea
      name="notes"
      rows="3"
      hx-post="/blueprints/phases/${phase.id}/notes"
      hx-trigger="blur"
      hx-swap="none"
      placeholder="Add your own notes about this phase…"
      class="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-purple-500 focus:outline-none resize-none">${notesValue}</textarea>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Chat thread rendering (exported for use in routes)
// ---------------------------------------------------------------------------

export function renderChatThread(phaseId: number, history: ChatEntry[]): string {
  if (history.length === 0) {
    return `<p class="text-xs text-slate-500 text-center py-4">No messages yet. Start a conversation above.</p>`;
  }

  return history.map((entry, i) => renderChatEntry(phaseId, entry, i)).join("\n");
}

function renderChatEntry(phaseId: number, entry: ChatEntry, index: number): string {
  const isUser = entry.role === "user";

  const bubbleClass = isUser
    ? "bg-purple-600/20 border border-purple-500/30 rounded-xl px-3 py-2 text-sm text-slate-200 self-end max-w-[85%]"
    : "bg-slate-700 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-200 self-start max-w-[85%]";

  const roleLabel = isUser
    ? `<span class="text-xs text-purple-400 font-medium mb-1 block">You</span>`
    : `<span class="text-xs text-slate-400 font-medium mb-1 block">Claude</span>`;

  let html = `<div class="flex ${isUser ? "justify-end" : "justify-start"}">
  <div class="${bubbleClass}">
    ${roleLabel}
    <p class="whitespace-pre-wrap">${escapeHtml(entry.content)}</p>`;

  // Apply button for assistant messages with proposals
  if (!isUser && entry.proposedEdits && entry.proposedEdits.length > 0) {
    if (entry.appliedAt) {
      html += `<div class="mt-2 text-xs text-emerald-400">✓ Changes applied</div>`;
    } else {
      const editSummary = entry.proposedEdits.length === 1
        ? "1 change"
        : `${entry.proposedEdits.length} changes`;
      html += `
    <button
      hx-post="/blueprints/phases/${phaseId}/chat/apply/${index}"
      hx-target="#phase-milestones-${phaseId}"
      hx-swap="innerHTML"
      class="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-600/30 transition-colors">
      Apply ${editSummary}
    </button>`;
    }
  }

  html += `</div></div>`;
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

/**
 * Rough chat session cost estimate.
 * Assumes ~4 chars/token, Sonnet 4 pricing ($3/1M input, $15/1M output).
 * System prompt estimated at 800 tokens.
 */
function estimateChatCost(history: ChatEntry[]): string {
  const CHARS_PER_TOKEN = 4;
  const SYSTEM_TOKENS = 800;
  const INPUT_USD = 3e-6;
  const OUTPUT_USD = 15e-6;

  let totalCost = 0;
  let inputChars = SYSTEM_TOKENS * CHARS_PER_TOKEN;

  for (const e of history) {
    if (e.role === "user") {
      inputChars += e.content.length;
    } else {
      totalCost +=
        (inputChars / CHARS_PER_TOKEN) * INPUT_USD +
        (e.content.length / CHARS_PER_TOKEN) * OUTPUT_USD;
      inputChars += e.content.length;
    }
  }

  return `~$${totalCost.toFixed(4)}`;
}
