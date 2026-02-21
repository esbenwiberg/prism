/**
 * Reusable HTML-generating component functions for the dashboard.
 *
 * All functions return raw HTML strings. No template engine needed.
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

const BADGE_COLORS: Record<BadgeVariant, string> = {
  success: "background:#dcfce7;color:#166534;",
  warning: "background:#fef3c7;color:#92400e;",
  danger: "background:#fee2e2;color:#991b1b;",
  info: "background:#dbeafe;color:#1e40af;",
  neutral: "background:#f3f4f6;color:#374151;",
};

/** Render an inline badge. */
export function badge(text: string, variant: BadgeVariant = "neutral"): string {
  const style = BADGE_COLORS[variant];
  return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:0.75rem;font-weight:600;${style}">${escapeHtml(text)}</span>`;
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

/** Render a card container. */
export function card(title: string, body: string): string {
  return `
<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px;">
  <h3 style="margin:0 0 8px 0;font-size:1rem;font-weight:600;color:#111827;">${escapeHtml(title)}</h3>
  <div>${body}</div>
</div>`;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

/** Render a stat card with a label and value. */
export function statCard(label: string, value: string | number): string {
  return `
<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;text-align:center;min-width:120px;">
  <div style="font-size:1.5rem;font-weight:700;color:#111827;">${escapeHtml(String(value))}</div>
  <div style="font-size:0.75rem;color:#6b7280;margin-top:4px;">${escapeHtml(label)}</div>
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
        `<th style="padding:8px 12px;text-align:${col.align ?? "left"};border-bottom:2px solid #e5e7eb;font-size:0.75rem;font-weight:600;color:#6b7280;text-transform:uppercase;">${escapeHtml(col.header)}</th>`,
    )
    .join("");

  const bodyRows = rows
    .map(
      (row) =>
        `<tr style="border-bottom:1px solid #f3f4f6;">${columns.map((col) => `<td style="padding:8px 12px;text-align:${col.align ?? "left"};font-size:0.875rem;">${col.render(row)}</td>`).join("")}</tr>`,
    )
    .join("");

  return `
<table style="width:100%;border-collapse:collapse;">
  <thead><tr>${headerCells}</tr></thead>
  <tbody>${bodyRows}</tbody>
</table>`;
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
