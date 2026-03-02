/**
 * API Keys page -- list, create, and revoke named API keys.
 *
 * Raw keys are only displayed once at creation in a flash alert.
 * The stored hash is never shown.
 */

import type { ApiKeyRow } from "@prism/core";
import { layout } from "./layout.js";
import { escapeHtml, table, type TableColumn } from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiKeysPageData {
  apiKeys: ApiKeyRow[];
  userName: string;
  /** The newly-created raw key — shown once after creation, then gone. */
  newKey?: string;
  /** Simple flash message for delete/error feedback. */
  flash?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const PERM_BADGE_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  read: { bg: "bg-blue-400/10", text: "text-blue-400", ring: "ring-blue-400/20" },
  register: { bg: "bg-emerald-400/10", text: "text-emerald-400", ring: "ring-emerald-400/20" },
  index: { bg: "bg-amber-400/10", text: "text-amber-400", ring: "ring-amber-400/20" },
};

function permBadge(perm: string): string {
  const colors = PERM_BADGE_COLORS[perm] ?? { bg: "bg-slate-400/10", text: "text-slate-400", ring: "ring-slate-400/20" };
  return `<span class="inline-flex items-center rounded-md ${colors.bg} px-2 py-0.5 text-xs font-medium ${colors.text} ring-1 ring-inset ${colors.ring}">${escapeHtml(perm)}</span>`;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function apiKeysContent(data: ApiKeysPageData): string {
  const { apiKeys, newKey, flash } = data;

  // New-key flash — amber warning box shown once after key creation
  const newKeyHtml = newKey
    ? `<div class="rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-4 mb-4">
        <p class="text-sm font-semibold text-amber-300 mb-2">
          ⚠ Copy this key now — it will not be shown again.
        </p>
        <div class="flex items-center gap-3 mt-1">
          <code id="new-api-key" class="flex-1 block rounded bg-slate-900 px-3 py-2 text-sm font-mono text-amber-200 break-all">${escapeHtml(newKey)}</code>
          <button
            onclick="navigator.clipboard.writeText(document.getElementById('new-api-key').textContent).then(() => this.textContent = 'Copied!')"
            class="shrink-0 rounded-lg border border-amber-400/40 px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-400/10 transition-colors">
            Copy
          </button>
        </div>
      </div>`
    : "";

  // Generic flash message (delete confirmation, etc.)
  const flashHtml = flash && !newKey
    ? `<div class="rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-4 py-3 mb-4 text-sm text-emerald-400">${escapeHtml(flash)}</div>`
    : "";

  // Table
  const columns: TableColumn<ApiKeyRow>[] = [
    {
      header: "Name",
      render: (k) => `<span class="font-medium text-slate-200">${escapeHtml(k.name)}</span>`,
    },
    {
      header: "Prefix",
      render: (k) => `<code class="text-xs font-mono text-slate-400">${escapeHtml(k.keyPrefix)}…</code>`,
    },
    {
      header: "Permissions",
      render: (k) => {
        const perms = (k.permissions ?? ["read"]) as string[];
        return `<div class="flex gap-1.5 flex-wrap">${perms.map(permBadge).join("")}</div>`;
      },
    },
    {
      header: "Created",
      render: (k) => `<span class="text-slate-400">${escapeHtml(formatDate(k.createdAt))}</span>`,
    },
    {
      header: "Last used",
      render: (k) => `<span class="text-slate-400">${escapeHtml(formatDate(k.lastUsedAt))}</span>`,
    },
    {
      header: "",
      render: (k) =>
        `<button hx-delete="/api-keys/${k.id}" hx-target="#main-content" hx-confirm="Revoke API key &quot;${escapeHtml(k.name)}&quot;? Any callers using it will immediately lose access."
          class="rounded-lg bg-red-400/10 px-3 py-1 text-xs font-medium text-red-400 ring-1 ring-inset ring-red-400/20 hover:bg-red-400/20 transition-colors">
          Revoke
        </button>`,
      align: "right",
    },
  ];

  const tableHtml =
    apiKeys.length > 0
      ? table(columns, apiKeys)
      : `<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-10">
          <p class="text-sm text-slate-400">No API keys yet. Create one below.</p>
        </div>`;

  // Create form
  const formHtml = `
<div class="rounded-xl border border-slate-700 bg-slate-800 p-6 mt-6">
  <h2 class="text-base font-semibold text-slate-50 mb-4">Generate API Key</h2>
  <form hx-post="/api-keys" hx-target="#main-content">
    <div class="flex gap-4 flex-wrap items-end">
      <div class="flex-1 min-w-[220px] space-y-1.5">
        <label class="block text-sm font-medium text-slate-300">Name</label>
        <input type="text" name="name" required placeholder="e.g. hive-dev"
          class="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
      </div>
      <div class="space-y-1.5">
        <label class="block text-sm font-medium text-slate-300">Permissions</label>
        <div class="flex gap-4 items-center py-1.5">
          <label class="flex items-center gap-1.5 text-sm text-slate-300">
            <input type="checkbox" name="perm_read" value="1" checked class="rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500" />
            read
          </label>
          <label class="flex items-center gap-1.5 text-sm text-slate-300">
            <input type="checkbox" name="perm_register" value="1" class="rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500" />
            register
          </label>
          <label class="flex items-center gap-1.5 text-sm text-slate-300">
            <input type="checkbox" name="perm_index" value="1" class="rounded border-slate-600 bg-slate-900 text-purple-500 focus:ring-purple-500" />
            index
          </label>
        </div>
      </div>
      <div>
        <button type="submit"
          class="inline-flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-400">
          Generate key
        </button>
      </div>
    </div>
  </form>
</div>`;

  return newKeyHtml +
    flashHtml +
    `<h2 class="text-2xl font-bold text-slate-50 mb-6">API Keys</h2>` +
    tableHtml +
    formHtml;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Full page render (with layout shell).
 */
export function apiKeysPage(data: ApiKeysPageData): string {
  return layout({
    title: "API Keys",
    content: apiKeysContent(data),
    userName: data.userName,
    activeNav: "api-keys",
  });
}

/**
 * Content fragment only (for HTMX partial updates).
 */
export function apiKeysFragment(data: ApiKeysPageData): string {
  return apiKeysContent(data);
}
