/**
 * Reusable HTML-generating component functions for the dashboard.
 *
 * All functions return raw HTML strings.
 * Styled with Tailwind CSS (dark slate theme, purple accent).
 */

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const ESC: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Escape a string for safe inclusion in HTML. */
export function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => ESC[ch] ?? ch);
}

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

export type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral";

const BADGE_CLASSES: Record<BadgeVariant, string> = {
  success: "bg-emerald-400/10 text-emerald-400 ring-emerald-400/20",
  warning: "bg-amber-400/10 text-amber-400 ring-amber-400/20",
  danger: "bg-red-400/10 text-red-400 ring-red-400/20",
  info: "bg-blue-400/10 text-blue-400 ring-blue-400/20",
  neutral: "bg-slate-400/10 text-slate-400 ring-slate-400/20",
};

/** Render an inline badge pill. */
export function badge(text: string, variant: BadgeVariant = "neutral"): string {
  const cls = BADGE_CLASSES[variant];
  return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}">${escapeHtml(text)}</span>`;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

/** Render a card container with an optional title. */
export function card(title: string, body: string): string {
  return `
<div class="rounded-xl border border-slate-700 bg-slate-800 p-6 mb-4">
  <h3 class="text-base font-semibold text-slate-50 mb-3">${escapeHtml(title)}</h3>
  <div>${body}</div>
</div>`;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

/** Render a stat card with a label and value. */
export function statCard(
  label: string,
  value: string | number,
  opts?: { color?: string },
): string {
  const color = opts?.color;
  const valueClass = color ? `text-${color}-400` : "text-slate-50";
  return `
<div class="rounded-xl border border-slate-700 bg-slate-800 p-5 text-center min-w-[120px]">
  <div class="text-2xl font-semibold ${valueClass}">${escapeHtml(String(value))}</div>
  <div class="mt-1 text-xs text-slate-400">${escapeHtml(label)}</div>
</div>`;
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export interface TableColumn<T> {
  header: string;
  render: (row: T) => string;
  align?: "left" | "center" | "right";
}

/**
 * Render an HTML table from rows and column definitions.
 *
 * The `render` callback in each column should return already-escaped HTML.
 */
export function table<T>(columns: TableColumn<T>[], rows: T[]): string {
  const headerCells = columns
    .map(
      (col) =>
        `<th class="px-4 py-3 text-${col.align ?? "left"} text-xs font-medium uppercase tracking-wider text-slate-400">${escapeHtml(col.header)}</th>`,
    )
    .join("");

  const bodyRows = rows
    .map(
      (row) =>
        `<tr class="hover:bg-slate-800/50">${columns
          .map(
            (col) =>
              `<td class="whitespace-nowrap px-4 py-3 text-sm text-slate-300 text-${col.align ?? "left"}">${col.render(row)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");

  return `
<div class="overflow-x-auto">
  <table class="min-w-full divide-y divide-slate-700">
    <thead class="bg-slate-800/50">
      <tr>${headerCells}</tr>
    </thead>
    <tbody class="divide-y divide-slate-700">${bodyRows}</tbody>
  </table>
</div>`;
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

/** Map finding severity to a badge variant. */
export function severityBadge(severity: string): string {
  const map: Record<string, BadgeVariant> = {
    critical: "danger",
    high: "danger",
    medium: "warning",
    low: "info",
    info: "neutral",
  };
  return badge(severity, map[severity] ?? "neutral");
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

/** Render a button or anchor styled as a button. */
export function button(
  label: string,
  opts?: {
    variant?: "primary" | "secondary" | "danger";
    href?: string;
    attrs?: string;
  },
): string {
  const variant = opts?.variant ?? "primary";
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900";
  const variants: Record<string, string> = {
    primary: "bg-purple-500 text-white hover:bg-purple-400 focus:ring-purple-500",
    secondary:
      "border border-slate-600 text-slate-300 hover:bg-slate-800 hover:text-slate-50 focus:ring-slate-500",
    danger: "bg-red-500 text-white hover:bg-red-400 focus:ring-red-400",
  };
  const classes = `${base} ${variants[variant]}`;
  const extra = opts?.attrs ? ` ${opts.attrs}` : "";
  if (opts?.href) {
    return `<a href="${opts.href}" class="${classes}"${extra}>${label}</a>`;
  }
  return `<button class="${classes}"${extra}>${label}</button>`;
}

// ---------------------------------------------------------------------------
// Form inputs
// ---------------------------------------------------------------------------

/** Render a labelled text input. */
export function input(
  name: string,
  label: string,
  opts?: {
    type?: string;
    value?: string;
    required?: boolean;
    placeholder?: string;
  },
): string {
  const type = opts?.type ?? "text";
  const value = opts?.value !== undefined ? ` value="${escapeHtml(opts.value)}"` : "";
  const required = opts?.required ? " required" : "";
  const placeholder = opts?.placeholder
    ? ` placeholder="${escapeHtml(opts.placeholder)}"`
    : "";
  return `<div class="space-y-1.5">
  <label for="${name}" class="block text-sm font-medium text-slate-300">${escapeHtml(label)}</label>
  <input type="${type}" id="${name}" name="${name}"${value}${required}${placeholder}
    class="block w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
</div>`;
}

/** Render a labelled select dropdown. */
export function select(
  name: string,
  label: string,
  options: { value: string; label: string }[],
  selected?: string,
  attrs?: string,
): string {
  const optionHtml = options
    .map(
      (o) =>
        `<option value="${escapeHtml(o.value)}"${o.value === selected ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
    )
    .join("");
  const extra = attrs ? ` ${attrs}` : "";
  return `<div class="space-y-1.5">
  <label for="${name}" class="block text-sm font-medium text-slate-300">${escapeHtml(label)}</label>
  <select id="${name}" name="${name}"${extra}
    class="block w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-50 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500">
    ${optionHtml}
  </select>
</div>`;
}

/** Render a labelled textarea. */
export function textarea(
  name: string,
  label: string,
  opts?: { value?: string; required?: boolean; placeholder?: string; rows?: number },
): string {
  const rows = opts?.rows ?? 4;
  const required = opts?.required ? " required" : "";
  const placeholder = opts?.placeholder
    ? ` placeholder="${escapeHtml(opts.placeholder)}"`
    : "";
  const content = opts?.value !== undefined ? escapeHtml(opts.value) : "";
  return `<div class="space-y-1.5">
  <label for="${name}" class="block text-sm font-medium text-slate-300">${escapeHtml(label)}</label>
  <textarea id="${name}" name="${name}" rows="${rows}"${required}${placeholder}
    class="block w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 font-mono focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500">${content}</textarea>
</div>`;
}

/** Render a checkbox with a label. */
export function checkbox(name: string, label: string, checked: boolean): string {
  const checkedAttr = checked ? " checked" : "";
  return `<label class="flex items-center gap-3 cursor-pointer">
  <input type="checkbox" name="${escapeHtml(name)}" value="true"${checkedAttr}
    class="h-4 w-4 rounded border-slate-600 bg-slate-800 text-purple-500 focus:ring-purple-500 focus:ring-offset-0" />
  <span class="text-sm text-slate-300">${escapeHtml(label)}</span>
</label>`;
}

/** Render an empty-state placeholder. */
export function emptyState(message: string, actionHtml?: string): string {
  const action = actionHtml ? `<div class="mt-4">${actionHtml}</div>` : "";
  return `<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-12 px-6">
  <svg class="h-12 w-12 text-slate-600" fill="none" viewBox="0 0 24 24" stroke-width="1" stroke="currentColor">
    <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 0 1-2.247 2.118H6.622a2.25 2.25 0 0 1-2.247-2.118L3.75 7.5m6 4.125 2.25 2.25m0 0 2.25-2.25M12 13.875V7.5M3.75 7.5h16.5" />
  </svg>
  <p class="mt-3 text-sm text-slate-400">${escapeHtml(message)}</p>
  ${action}
</div>`;
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

/** Map index status to a badge variant. */
export function statusBadge(status: string): string {
  const map: Record<string, BadgeVariant> = {
    completed: "success",
    running: "info",
    pending: "neutral",
    failed: "danger",
    partial: "warning",
  };
  return badge(status, map[status] ?? "neutral");
}

// ---------------------------------------------------------------------------
// Project tab navigation
// ---------------------------------------------------------------------------

const PROJECT_TABS = [
  { key: "overview", label: "Overview" },
  // Structural layer
  { key: "files", label: "Browse Files" },
  { key: "symbols", label: "Symbols" },
  { key: "modules", label: "Modules" },
  { key: "graph", label: "Dependency Graph" },
  // Documentation layer
  { key: "purpose", label: "Purpose" },
  // Semantic layer
  { key: "summaries", label: "Summaries" },
  // Analysis layer
  { key: "findings", label: "Findings" },
  // Blueprint layer
  { key: "blueprints", label: "Blueprints" },
] as const;

export type ProjectTabKey = typeof PROJECT_TABS[number]["key"];

/**
 * Render the project name heading + tab row.
 * Embed at the top of every project page and sub-page fragment.
 */
export function projectTabNav(
  projectId: number,
  projectName: string,
  activeTab: ProjectTabKey,
): string {
  const tabs = PROJECT_TABS.map(({ key, label }) => {
    const href =
      key === "overview"
        ? `/projects/${projectId}`
        : `/projects/${projectId}/${key}`;
    const isActive = key === activeTab;
    const cls = isActive
      ? "border-b-2 border-purple-400 px-4 py-2.5 text-sm font-medium text-slate-50 whitespace-nowrap"
      : "border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-slate-400 whitespace-nowrap transition-colors hover:border-slate-500 hover:text-slate-200";
    return `<a href="${href}" hx-get="${href}" hx-target="#main-content" hx-push-url="true" class="${cls}">${escapeHtml(label)}</a>`;
  }).join("");

  return `<h2 class="text-2xl font-bold text-slate-50 mb-4">${escapeHtml(projectName)}</h2>
<div class="border-b border-slate-700 mb-6">
  <nav class="-mb-px flex gap-1 overflow-x-auto">${tabs}</nav>
</div>`;
}
