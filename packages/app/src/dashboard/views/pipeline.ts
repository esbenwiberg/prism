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
  const { projectId, layerRuns } = data;
  const layers = buildLayers(projectId);

  const cards = layers
    .map((def, i) => {
      const card = layerCard(def, layerRuns[def.key]);
      return i < layers.length - 1 ? card + CONNECTOR : card;
    })
    .join("");

  return (
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
// "How It Works" — comprehensive pipeline info page
// ---------------------------------------------------------------------------

interface SubCard {
  title: string;
  description: string;
  isNew?: boolean;
}

interface StageInfo {
  number: string;
  label: string;
  subtitle: string;
  color: string;
  subcards: SubCard[];
}

const INFO_STAGES: StageInfo[] = [
  {
    number: "0",
    label: "Project Registration",
    subtitle: "Register the codebase to index",
    color: "slate",
    subcards: [
      {
        title: "prism init / Add Project",
        description:
          "Registers the git repository URL, derives a URL-safe slug from the project name, and creates the project record in the database. All subsequent pipeline stages operate against this registered project.",
      },
    ],
  },
  {
    number: "1",
    label: "Structural Layer",
    subtitle: "Parse code, extract symbols, build dependency graph",
    color: "blue",
    subcards: [
      {
        title: "File Walker",
        description:
          "Scans the project directory, respects skip patterns (node_modules, dist, etc.), detects language via file extension, and computes a SHA-256 content hash per file for incremental change detection.",
      },
      {
        title: "Tree-Sitter Parser",
        description:
          "Parses TypeScript/JavaScript, Python, and C# source files via WASM grammars. Produces a full AST used for symbol extraction in the next step.",
      },
      {
        title: "Symbol Extraction",
        description:
          "Extracts functions, classes, interfaces, types, and enums — capturing signatures, docstrings, line ranges, and the exported flag for each symbol.",
      },
      {
        title: "Dependency Graph",
        description:
          "Builds import/call/extends/implements edges between files. Resolves C# using directives to actual file paths for cross-language accuracy.",
      },
      {
        title: "Metrics",
        description:
          "Computes per-file cyclomatic complexity, efferent/afferent coupling, and cohesion scores — used by pattern detectors in Stage 4.",
      },
    ],
  },
  {
    number: "2",
    label: "Documentation Layer",
    subtitle: "Parse docs, extract comments, build project intent",
    color: "teal",
    subcards: [
      {
        title: "Doc File Parser",
        description:
          "Reads README, CHANGELOG, .md, .rst, and .adoc files. Splits them into structured sections for downstream consumption.",
      },
      {
        title: "Config Parser",
        description:
          "Reads package.json, tsconfig, .yaml configs to detect the tech stack, build tooling, and framework choices.",
      },
      {
        title: "Comment Extraction",
        description:
          "Pulls JSDoc comments, Python docstrings, and C# XML doc-comments from source files.",
      },
      {
        title: "Project Intent",
        description:
          "Assembles all docs, configs, and comments into a structured intent document. Now persisted as a summary row (level=\"intent\") so downstream layers can reference it cheaply.",
        isNew: true,
      },
    ],
  },
  {
    number: "2.5",
    label: "Purpose Layer",
    subtitle: "AI-synthesised App Purpose Document",
    color: "amber",
    subcards: [
      {
        title: "Context Assembly",
        description:
          "Combines the docs intent, database schema snippets, route patterns, exported type names, and test descriptions into a single prompt payload.",
      },
      {
        title: "Claude Sonnet",
        description:
          "Generates a structured narrative of what the codebase does, who its users are, and how its major subsystems fit together.",
      },
      {
        title: "Staleness Detection",
        description:
          "Compares a hash of all inputs against the previous run — skips regeneration entirely if the context hasn't changed.",
      },
    ],
  },
  {
    number: "3",
    label: "Semantic Layer",
    subtitle: "Summarise every symbol, embed for vector search",
    color: "violet",
    subcards: [
      {
        title: "Symbol Filtering",
        description:
          "Selects summarisable symbols — functions and classes with enough code to warrant an AI summary. Skips trivial getters, one-liners, and type aliases.",
      },
      {
        title: "Staleness Propagation",
        description:
          "When file B changes, file A (which imports B) is marked for re-summarisation. Walks the reverse dependency graph at depth 1, capped at 50 files to bound cost.",
        isNew: true,
      },
      {
        title: "Claude Haiku Summaries",
        description:
          "Generates 2–4 sentence summaries per symbol. Includes quality self-assessment (0–1 score): retries with an enhanced prompt if score < 0.4, and demotes the strategy if quality remains low.",
      },
      {
        title: "Heuristic Checks",
        description:
          "Post-generation validation that flags too-short, too-generic, or missing-key-term summaries before they reach the embedding stage.",
        isNew: true,
      },
      {
        title: "Doc Embedding",
        description:
          "Documentation files are chunked by heading, summarised, and embedded alongside code — so semantic search covers docs and code equally.",
        isNew: true,
      },
      {
        title: "Vector Embeddings",
        description:
          "3072-dimensional vectors via Voyage or OpenAI, stored in PostgreSQL pgvector with an HNSW index for fast approximate nearest-neighbour lookup.",
      },
      {
        title: "Quality Gate",
        description:
          "Only embeds summaries with a quality score ≥ 0.4. Near-duplicate detection (cosine similarity > 0.95) prevents redundant vectors from cluttering the index.",
        isNew: true,
      },
    ],
  },
  {
    number: "4",
    label: "Analysis Layer",
    subtitle: "Rollup summaries, detect patterns, find gaps",
    color: "orange",
    subcards: [
      {
        title: "File Rollup",
        description:
          "Rolls symbol summaries into a file-level summary. Now uses Haiku (~10x cheaper than Sonnet). Delta detection skips files where < 10% of function summaries changed. Batch rollups group small files into single LLM calls.",
        isNew: true,
      },
      {
        title: "Module Rollup",
        description:
          "Aggregates file summaries into module-level summaries. Also uses Haiku by default for cost efficiency.",
      },
      {
        title: "System Rollup",
        description:
          "Condenses all module summaries into a single system-level narrative. Still uses Sonnet for this top-level synthesis.",
      },
      {
        title: "Pattern Detectors",
        description:
          "Five structural detectors: circular dependencies, god modules, dead code, layering violations, and excessive coupling. Now includes fingerprint-based deduplication and confidence scoring to reduce noise.",
        isNew: true,
      },
      {
        title: "Gap Analysis",
        description:
          "Compares the docs intent vs actual code reality. Caching: skips if the intent document and system summary haven't changed since the last run.",
        isNew: true,
      },
    ],
  },
  {
    number: "5",
    label: "Context Enrichment",
    subtitle: "Assemble relevant context for AI agents (query time)",
    color: "emerald",
    subcards: [
      {
        title: "Explicit File Mentions",
        description:
          "Regex extraction of file paths from the user's query, with fuzzy resolution against the project's file index. Mentioned files get Priority 1 in results.",
        isNew: true,
      },
      {
        title: "Forward Dependencies",
        description:
          "For explicitly mentioned files, retrieves what they import and any shared coupling points — giving the AI agent a broader picture of the affected surface area.",
        isNew: true,
      },
      {
        title: "Semantic Search",
        description:
          "Vector similarity search with keyword boosting. Now partitioned: code results and documentation results are retrieved separately for balanced coverage.",
        isNew: true,
      },
      {
        title: "Doc Search",
        description:
          "Documentation-specific results with question-word boost. Falls back to full-text search when vector results return fewer than 3 matches.",
        isNew: true,
      },
      {
        title: "Blast Radius",
        description:
          "Reverse-dependency BFS from relevant files, aggregated across multiple entry points with overlap ranking to surface the most impacted downstream files.",
      },
      {
        title: "Architecture Context",
        description:
          "Injects the purpose document, system summary, project intent, and module overview into the context window for grounding.",
      },
      {
        title: "Change History",
        description:
          "Recent commits, co-change patterns, and hotspot detection — helps the AI agent understand what's actively being worked on.",
      },
    ],
  },
  {
    number: "6",
    label: "Blueprints",
    subtitle: "AI-generated redesign proposals (on demand)",
    color: "purple",
    subcards: [
      {
        title: "Pass 1: Master Plan",
        description:
          "Claude Sonnet generates a phased redesign plan from the full system context plus an optional user-provided goal.",
      },
      {
        title: "Pass 2: Phase Detail",
        description:
          "On-demand expansion of each phase with concrete milestones, key files to change, and verification criteria.",
      },
      {
        title: "AI Review Chat",
        description:
          "Per-phase conversation for reviewing and refining proposed changes before committing to them.",
      },
    ],
  },
];

const INFO_COLOR_CLASSES: Record<string, { border: string; num: string; dot: string; summary: string; strip: string }> = {
  slate:   { border: "border-slate-500/40",   num: "bg-slate-500/20 text-slate-300 ring-slate-500/30",    dot: "bg-slate-400",   summary: "bg-slate-500/10 hover:bg-slate-500/20 text-slate-300", strip: "border-l-slate-500/50" },
  blue:    { border: "border-blue-500/40",    num: "bg-blue-500/20 text-blue-400 ring-blue-500/30",       dot: "bg-blue-400",    summary: "bg-blue-500/10 hover:bg-blue-500/20 text-blue-300",    strip: "border-l-blue-500/50" },
  teal:    { border: "border-teal-500/40",    num: "bg-teal-500/20 text-teal-400 ring-teal-500/30",       dot: "bg-teal-400",    summary: "bg-teal-500/10 hover:bg-teal-500/20 text-teal-300",    strip: "border-l-teal-500/50" },
  amber:   { border: "border-amber-500/40",   num: "bg-amber-500/20 text-amber-400 ring-amber-500/30",    dot: "bg-amber-400",   summary: "bg-amber-500/10 hover:bg-amber-500/20 text-amber-300", strip: "border-l-amber-500/50" },
  violet:  { border: "border-violet-500/40",  num: "bg-violet-500/20 text-violet-400 ring-violet-500/30",  dot: "bg-violet-400",  summary: "bg-violet-500/10 hover:bg-violet-500/20 text-violet-300", strip: "border-l-violet-500/50" },
  orange:  { border: "border-orange-500/40",  num: "bg-orange-500/20 text-orange-400 ring-orange-500/30",  dot: "bg-orange-400",  summary: "bg-orange-500/10 hover:bg-orange-500/20 text-orange-300", strip: "border-l-orange-500/50" },
  emerald: { border: "border-emerald-500/40", num: "bg-emerald-500/20 text-emerald-400 ring-emerald-500/30", dot: "bg-emerald-400", summary: "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300", strip: "border-l-emerald-500/50" },
  purple:  { border: "border-purple-500/40",  num: "bg-purple-500/20 text-purple-400 ring-purple-500/30",  dot: "bg-purple-400",  summary: "bg-purple-500/10 hover:bg-purple-500/20 text-purple-300", strip: "border-l-purple-500/50" },
};

const INFO_CONNECTOR = `
<div class="flex justify-start pl-12 py-1.5">
  <svg class="w-5 h-8 text-slate-600" fill="none" viewBox="0 0 20 32" stroke="currentColor" stroke-width="2">
    <path stroke-linecap="round" stroke-linejoin="round" d="M10 0 v24 m-5 -5 l5 5 l5 -5" />
  </svg>
</div>`;

function infoSubCard(sub: SubCard, color: string): string {
  const c = INFO_COLOR_CLASSES[color] ?? INFO_COLOR_CLASSES.blue;
  const newBadge = sub.isNew
    ? ` ${badge("NEW", "info")}`
    : "";
  return `
  <details class="group border-l-2 ${c.strip} ml-2">
    <summary class="flex items-center gap-3 cursor-pointer select-none rounded-r-lg px-4 py-3 text-sm font-medium ${c.summary} transition-colors list-none [&::-webkit-details-marker]:hidden">
      <svg class="w-4 h-4 shrink-0 text-slate-500 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
      <span>${escapeHtml(sub.title)}</span>${newBadge}
    </summary>
    <div class="px-4 pb-4 pt-2 ml-7 text-sm text-slate-400 leading-relaxed">
      ${escapeHtml(sub.description)}
    </div>
  </details>`;
}

function infoStageCard(stage: StageInfo): string {
  const c = INFO_COLOR_CLASSES[stage.color] ?? INFO_COLOR_CLASSES.blue;
  const subcards = stage.subcards.map((s) => infoSubCard(s, stage.color)).join("");

  return `
<div class="rounded-xl border border-slate-700 bg-slate-800 p-6 border-l-4 ${c.border}">
  <div class="flex items-start gap-4 mb-2">
    <span class="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-xl text-sm font-bold ring-1 ${c.num}">
      ${escapeHtml(stage.number)}
    </span>
    <div class="min-w-0">
      <h3 class="text-lg font-semibold text-slate-50">${escapeHtml(stage.label)}</h3>
      <p class="text-sm text-slate-400 mt-0.5">${escapeHtml(stage.subtitle)}</p>
    </div>
  </div>

  <div class="mt-4 space-y-1">
    ${subcards}
  </div>
</div>`;
}

function buildInfoContent(): string {
  const cards = INFO_STAGES
    .map((stage, i) => {
      const card = infoStageCard(stage);
      return i < INFO_STAGES.length - 1 ? card + INFO_CONNECTOR : card;
    })
    .join("");

  const legendItems = [
    { label: "Parsing & Structure", color: "blue" },
    { label: "Documentation", color: "teal" },
    { label: "AI Summaries", color: "violet" },
    { label: "Analysis & Findings", color: "orange" },
    { label: "Context Enrichment", color: "emerald" },
    { label: "Blueprints", color: "purple" },
  ];

  const legend = legendItems
    .map((item) => {
      const c = INFO_COLOR_CLASSES[item.color] ?? INFO_COLOR_CLASSES.blue;
      return `<span class="inline-flex items-center gap-1.5 text-xs text-slate-400"><span class="w-2.5 h-2.5 rounded-full ${c.dot}"></span>${escapeHtml(item.label)}</span>`;
    })
    .join("");

  const footer = `
<div class="mt-8 rounded-lg border border-slate-700/60 bg-slate-800/50 px-5 py-4 text-sm text-slate-500">
  After indexing, query cheaply many times via MCP tools, REST API, or this dashboard.
</div>`;

  return (
    `<div class="mb-8">
      <h2 class="text-2xl font-bold text-slate-50">How It Works</h2>
      <p class="mt-2 text-sm text-slate-400 leading-relaxed max-w-3xl">
        Interactive diagram of Prism's indexing pipeline. Click any card to expand details.
        Run <code class="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded ring-1 ring-slate-700">prism index</code>
        to execute stages 1–4; context enrichment happens at query time; blueprints are generated on demand.
      </p>
      <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2">
        ${legend}
      </div>
    </div>` +
    `<div class="max-w-3xl">${cards}</div>` +
    footer
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

export function pipelineInfoPage(userName: string): string {
  return layout({
    title: "How It Works",
    content: buildInfoContent(),
    userName,
    activeNav: "pipeline",
  });
}
