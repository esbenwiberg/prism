/**
 * Symbols list page — structural layer (Layer 1).
 *
 * Shows a filterable table of all symbols (functions, classes, etc.)
 * extracted by tree-sitter during structural indexing.
 */

import { layout } from "./layout.js";
import {
  escapeHtml,
  badge,
  statCard,
  table,
  projectTabNav,
  type TableColumn,
  type BadgeVariant,
} from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SymbolViewData {
  id: number;
  name: string;
  kind: string;
  filePath: string;
  exported: boolean;
  complexity: string | null;
}

export interface SymbolsPageData {
  projectId: number;
  projectName: string;
  symbols: SymbolViewData[];
  userName: string;
  kindFilter?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const KIND_VARIANTS: Record<string, BadgeVariant> = {
  function: "info",
  class: "success",
  interface: "warning",
  type: "neutral",
  enum: "danger",
  export: "neutral",
  import: "neutral",
};

function kindBadge(kind: string): string {
  const variant = KIND_VARIANTS[kind] ?? "neutral";
  return badge(kind, variant);
}

function complexityBadge(complexity: string | null): string {
  if (!complexity) return `<span class="text-slate-600">—</span>`;
  const num = parseFloat(complexity);
  if (isNaN(num)) return badge(complexity, "neutral");
  const variant: BadgeVariant = num > 20 ? "danger" : num > 10 ? "warning" : "success";
  return badge(complexity, variant);
}


const KINDS = ["all", "function", "class", "interface", "type", "enum", "export", "import"];

function filterBar(projectId: number, activeFilter: string): string {
  const buttons = KINDS.map((k) => {
    const isActive = k === activeFilter || (k === "all" && !activeFilter);
    const url =
      k === "all"
        ? `/projects/${projectId}/symbols`
        : `/projects/${projectId}/symbols?kind=${k}`;
    const activeClasses = isActive
      ? "bg-purple-500 text-white"
      : "bg-slate-800 text-slate-400 ring-1 ring-inset ring-slate-700 hover:bg-slate-700 hover:text-slate-50";
    return `<a href="${url}"
               hx-get="${url}"
               hx-target="#main-content"
               hx-push-url="true"
               class="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${activeClasses}">
              ${escapeHtml(k === "all" ? "All" : k.charAt(0).toUpperCase() + k.slice(1))}
            </a>`;
  }).join("");

  return `<div class="flex gap-2 mb-4 flex-wrap">${buttons}</div>`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const COLUMNS: TableColumn<SymbolViewData>[] = [
  {
    header: "Name",
    render: (s) => `<span class="font-medium font-mono text-sm text-slate-200">${escapeHtml(s.name)}</span>`,
  },
  {
    header: "Kind",
    render: (s) => kindBadge(s.kind),
    align: "center",
  },
  {
    header: "File",
    render: (s) => `<span class="font-mono text-xs text-slate-400">${escapeHtml(s.filePath)}</span>`,
  },
  {
    header: "Exported",
    render: (s) => s.exported
      ? `<span class="text-emerald-400">✓</span>`
      : `<span class="text-slate-600">—</span>`,
    align: "center",
  },
  {
    header: "Complexity",
    render: (s) => complexityBadge(s.complexity),
    align: "center",
  },
];

/**
 * Render the full symbols page.
 */
export function symbolsPage(data: SymbolsPageData): string {
  const { projectId, projectName, symbols, userName, kindFilter = "" } = data;

  const stats = `
<div class="flex gap-4 flex-wrap mb-6">
  ${statCard("Symbols", symbols.length)}
</div>`;

  const emptyState = `<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-12">
    <p class="text-sm text-slate-400">No symbols found. Run the structural indexing layer first.</p>
  </div>`;

  const content =
    projectTabNav(projectId, projectName, "symbols") +
    `<h2 class="text-xl font-semibold text-slate-50 mb-4">Symbols (${symbols.length})</h2>` +
    stats +
    filterBar(projectId, kindFilter) +
    (symbols.length > 0 ? table(COLUMNS, symbols) : emptyState);

  return layout({
    title: `${projectName} — Symbols`,
    content,
    userName,
    activeNav: `project-${projectId}`,
  });
}

/**
 * Render just the content fragment (for HTMX partial updates).
 */
export function symbolsFragment(data: SymbolsPageData): string {
  const { projectId, projectName, symbols, kindFilter = "" } = data;

  const emptyState = `<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-12">
    <p class="text-sm text-slate-400">No symbols found. Run the structural indexing layer first.</p>
  </div>`;

  const fragmentColumns: TableColumn<SymbolViewData>[] = [
    {
      header: "Name",
      render: (s) => `<span class="font-medium font-mono text-sm text-slate-200">${escapeHtml(s.name)}</span>`,
    },
    {
      header: "Kind",
      render: (s) => kindBadge(s.kind),
      align: "center",
    },
    {
      header: "File",
      render: (s) => `<span class="font-mono text-xs text-slate-400">${escapeHtml(s.filePath)}</span>`,
    },
    {
      header: "Exported",
      render: (s) => s.exported
        ? `<span class="text-emerald-400">✓</span>`
        : `<span class="text-slate-600">—</span>`,
      align: "center",
    },
    {
      header: "Complexity",
      render: (s) => complexityBadge(s.complexity),
      align: "center",
    },
  ];

  return (
    projectTabNav(projectId, projectName, "symbols") +
    `<h2 class="text-xl font-semibold text-slate-50 mb-4">Symbols (${symbols.length})</h2>` +
    filterBar(projectId, kindFilter) +
    (symbols.length > 0 ? table(fragmentColumns, symbols) : emptyState)
  );
}
