/**
 * Pipeline page — visual overview of the five-layer indexing pipeline.
 *
 * Shows each layer's description, what it produces, and the stats from
 * the most recent index run for that layer.
 */

import type { LayerName } from "@prism/core";
import { layout } from "./layout.js";
import { escapeHtml, badge } from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LayerRunData {
  status: string;
  filesProcessed: number;
  filesTotal: number;
  durationMs: number | null;
  costUsd: string | null;
  error: string | null;
  completedAt: Date | null;
}

export interface PipelinePageData {
  projectId: number;
  projectName: string;
  userName: string;
  /** Most recent run data per layer, keyed by layer name. */
  layerRuns: Partial<Record<LayerName, LayerRunData>>;
}

// ---------------------------------------------------------------------------
// Layer definitions
// ---------------------------------------------------------------------------

interface LayerDef {
  key: LayerName;
  number: string;
  label: string;
  color: string;         // Tailwind color stem, e.g. "blue"
  description: string;
  produces: string;
  links: Array<{ label: string; href: string }>;
  note?: string;
}

function buildLayers(projectId: number): LayerDef[] {
  return [
    {
      key: "structural",
      number: "1",
      label: "Structural",
      color: "blue",
      description:
        "Walks every file in the project using a glob walker, then runs tree-sitter to parse supported languages (TypeScript, JavaScript, C#, Python). Extracts symbols (functions, classes, interfaces, types), builds a dependency graph between files, and computes per-file complexity, coupling, and cohesion metrics.",
      produces: "Files · Symbols · Dependency graph",
      links: [
        { label: "Browse Files", href: `/projects/${projectId}/files` },
        { label: "Symbols", href: `/projects/${projectId}/symbols` },
        { label: "Dependency Graph", href: `/projects/${projectId}/graph` },
      ],
    },
    {
      key: "docs",
      number: "2",
      label: "Documentation",
      color: "teal",
      description:
        "Parses documentation files (README, CHANGELOG, .rst, .adoc), config files (package.json, tsconfig, .yaml), and inline doc-comments from source files. Assembles a project intent document that captures what the codebase is supposed to do — used by downstream layers to ground AI analysis.",
      produces: "File doc content · Project intent",
      links: [
        { label: "Browse Files", href: `/projects/${projectId}/files` },
      ],
    },
    {
      key: "purpose",
      number: "2.5",
      label: "Purpose",
      color: "amber",
      description:
        "AI-synthesised App Purpose Document. Combines the docs intent, database schema snippets, route patterns, exported type names, and test descriptions into a single structured narrative. Gives every downstream layer a high-level understanding of what the codebase is for and who uses it.",
      produces: "App Purpose Document",
      links: [
        { label: "View Purpose", href: `/projects/${projectId}/purpose` },
      ],
    },
    {
      key: "semantic",
      number: "3",
      label: "Semantic",
      color: "violet",
      description:
        "Calls Claude Haiku to generate a concise natural-language summary for each eligible function and class, using the surrounding code as context. Each summary is then embedded into a high-dimensional vector using the configured embedding model and stored in PostgreSQL via pgvector. Enables semantic similarity search across the codebase.",
      produces: "Function summaries · Embeddings",
      links: [
        { label: "Summaries", href: `/projects/${projectId}/summaries?level=function` },
        { label: "Search", href: `/projects/${projectId}/search` },
      ],
    },
    {
      key: "analysis",
      number: "4",
      label: "Analysis",
      color: "orange",
      description:
        "Runs three sub-steps: (1) Hierarchical summary rollup — function summaries are rolled into file-level, then module-level, then a single system-level summary. (2) Pattern detection — five structural detectors flag circular dependencies, layering violations, god modules, dead code, and excessive coupling. (3) Gap analysis — compares the docs intent with the system summary to surface mismatches between stated goals and actual code.",
      produces: "Module & system summaries · Findings",
      links: [
        { label: "Summaries", href: `/projects/${projectId}/summaries` },
        { label: "Findings", href: `/projects/${projectId}/findings` },
        { label: "Modules", href: `/projects/${projectId}/modules` },
      ],
    },
    {
      key: "blueprint",
      number: "5",
      label: "Blueprint",
      color: "purple",
      description:
        "Generates actionable redesign proposals on demand (not run automatically during indexing). Uses the complete analysis context — purpose document, system summary, findings, and an optional user goal — to propose concrete architectural improvements as phased plans with milestones.",
      produces: "Blueprint plans · Phase milestones",
      links: [
        { label: "Blueprints", href: `/projects/${projectId}/blueprints` },
      ],
      note: 'Run via "Generate Blueprints" on the project page.',
    },
  ];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function breadcrumb(projectId: number, projectName: string): string {
  return `<div class="mb-6 flex items-center gap-1.5 text-sm">
  <a href="/projects/${projectId}"
     hx-get="/projects/${projectId}"
     hx-target="#main-content"
     hx-push-url="true"
     class="text-purple-400 hover:text-purple-300">${escapeHtml(projectName)}</a>
  <span class="text-slate-600">/</span>
  <span class="text-slate-400">Pipeline</span>
</div>`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatCost(usd: string | null): string {
  if (!usd || parseFloat(usd) === 0) return "—";
  const n = parseFloat(usd);
  if (n < 0.001) return `< $0.001`;
  return `$${n.toFixed(3)}`;
}

const LAYER_STATUS_COLORS: Record<string, string> = {
  completed: "bg-emerald-500/10 text-emerald-400 ring-1 ring-inset ring-emerald-500/20",
  running:   "bg-blue-500/10 text-blue-400 ring-1 ring-inset ring-blue-500/20",
  failed:    "bg-red-500/10 text-red-400 ring-1 ring-inset ring-red-500/20",
  pending:   "bg-slate-700/50 text-slate-400 ring-1 ring-inset ring-slate-600",
};

function statusPill(status: string): string {
  const cls = LAYER_STATUS_COLORS[status] ?? LAYER_STATUS_COLORS.pending;
  return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}">${escapeHtml(status)}</span>`;
}

const COLOR_CLASSES: Record<string, { border: string; badge: string; num: string }> = {
  blue:   { border: "border-blue-500/40",   badge: "bg-blue-500/10 text-blue-400 ring-1 ring-blue-500/20",   num: "text-blue-400" },
  teal:   { border: "border-teal-500/40",   badge: "bg-teal-500/10 text-teal-400 ring-1 ring-teal-500/20",   num: "text-teal-400" },
  amber:  { border: "border-amber-500/40",  badge: "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20", num: "text-amber-400" },
  violet: { border: "border-violet-500/40", badge: "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20", num: "text-violet-400" },
  orange: { border: "border-orange-500/40", badge: "bg-orange-500/10 text-orange-400 ring-1 ring-orange-500/20", num: "text-orange-400" },
  purple: { border: "border-purple-500/40", badge: "bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20", num: "text-purple-400" },
};

function layerCard(def: LayerDef, run: LayerRunData | undefined): string {
  const c = COLOR_CLASSES[def.color] ?? COLOR_CLASSES.purple;

  const runStats = run
    ? `<div class="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-400 border-t border-slate-700/60 pt-4">
        <span class="flex items-center gap-1.5">Last run: ${statusPill(run.status)}</span>
        <span>Files: <span class="text-slate-200">${run.filesProcessed}${run.filesTotal > 0 ? ` / ${run.filesTotal}` : ""}</span></span>
        <span>Duration: <span class="text-slate-200">${formatDuration(run.durationMs)}</span></span>
        <span>Cost: <span class="text-slate-200">${formatCost(run.costUsd)}</span></span>
        ${run.completedAt ? `<span>Completed: <span class="text-slate-200">${escapeHtml(run.completedAt.toLocaleString())}</span></span>` : ""}
        ${run.error ? `<span class="col-span-full text-red-400">Error: ${escapeHtml(run.error)}</span>` : ""}
      </div>`
    : `<div class="mt-4 border-t border-slate-700/60 pt-4 text-xs text-slate-500">Not yet run</div>`;

  const links = def.links
    .map(
      (l) =>
        `<a href="${l.href}"
            hx-get="${l.href}"
            hx-target="#main-content"
            hx-push-url="true"
            class="inline-flex items-center rounded-md ${c.badge} px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-80">
          ${escapeHtml(l.label)}
        </a>`,
    )
    .join("");

  const noteHtml = def.note
    ? `<p class="mt-2 text-xs text-slate-500 italic">${escapeHtml(def.note)}</p>`
    : "";

  return `
<div class="rounded-xl border border-slate-700 bg-slate-800 p-6 border-l-2 ${c.border}">
  <div class="flex items-start justify-between gap-4 mb-3">
    <div class="flex items-center gap-3 min-w-0">
      <span class="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-900 text-xs font-bold ${c.num} ring-1 ring-slate-700">
        ${escapeHtml(def.number)}
      </span>
      <h3 class="text-base font-semibold text-slate-50">${escapeHtml(def.label)}</h3>
    </div>
    ${run ? statusPill(run.status) : ""}
  </div>

  <p class="text-sm text-slate-300 leading-relaxed">${escapeHtml(def.description)}</p>

  <div class="mt-3 flex items-start gap-2">
    <span class="text-xs text-slate-500 mt-0.5 shrink-0">Produces:</span>
    <span class="text-xs text-slate-400">${escapeHtml(def.produces)}</span>
  </div>

  <div class="mt-3 flex flex-wrap gap-2">
    ${links}
  </div>

  ${noteHtml}
  ${runStats}
</div>`;
}

const CONNECTOR = `
<div class="flex justify-start pl-10 py-1">
  <svg class="w-4 h-6 text-slate-600" fill="none" viewBox="0 0 16 24" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M8 0 v16 m-4 -4 l4 4 l4 -4" />
  </svg>
</div>`;

// ---------------------------------------------------------------------------
// Page content builder
// ---------------------------------------------------------------------------

function buildContent(data: PipelinePageData): string {
  const { projectId, projectName, layerRuns } = data;
  const layers = buildLayers(projectId);

  const cards = layers
    .map((def, i) => {
      const card = layerCard(def, layerRuns[def.key]);
      return i < layers.length - 1 ? card + CONNECTOR : card;
    })
    .join("");

  return (
    breadcrumb(projectId, projectName) +
    `<div class="mb-6">
      <h2 class="text-2xl font-bold text-slate-50">Indexing Pipeline</h2>
      <p class="mt-1 text-sm text-slate-400">
        Prism indexes codebases through a sequential pipeline. Each layer builds on the previous one —
        run <code class="font-mono text-xs bg-slate-800 px-1 py-0.5 rounded">prism index</code> to execute
        layers 1–4; blueprints are generated on demand.
      </p>
    </div>` +
    `<div class="max-w-3xl">${cards}</div>`
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function pipelinePage(data: PipelinePageData): string {
  return layout({
    title: `${data.projectName} — Pipeline`,
    content: buildContent(data),
    userName: data.userName,
    activeNav: `project-${data.projectId}`,
  });
}

export function pipelineFragment(data: PipelinePageData): string {
  return buildContent(data);
}
