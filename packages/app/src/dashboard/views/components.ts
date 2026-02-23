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
export function statCard(label: string, value: string | number): string {
  return `
<div class="rounded-xl border border-slate-700 bg-slate-800 p-5 text-center min-w-[120px]">
  <div class="text-2xl font-semibold text-slate-50">${escapeHtml(String(value))}</div>
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
