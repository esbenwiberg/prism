/**
 * Credentials page -- list, add, and delete git PATs.
 *
 * Tokens are never displayed; only label, provider, and created date are shown.
 */

import type { CredentialRow } from "@prism/core";
import { layout } from "./layout.js";
import { escapeHtml, badge, table, type TableColumn } from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CredentialsPageData {
  credentials: CredentialRow[];
  userName: string;
  /** Optional flash message shown after create/delete. */
  flash?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function providerBadge(provider: string): string {
  const variant = provider === "github" ? "info" : "neutral";
  const label = provider === "github" ? "GitHub" : "Azure DevOps";
  return badge(label, variant);
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Credential list + form
// ---------------------------------------------------------------------------

function credentialContent(data: CredentialsPageData): string {
  const { credentials, flash } = data;

  const flashHtml = flash
    ? `<div class="rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-4 py-3 mb-4 text-sm text-emerald-400">${escapeHtml(flash)}</div>`
    : "";

  // ---------- Table ----------
  const columns: TableColumn<CredentialRow>[] = [
    {
      header: "Label",
      render: (c) => `<span class="font-medium text-slate-200">${escapeHtml(c.label)}</span>`,
    },
    {
      header: "Provider",
      render: (c) => providerBadge(c.provider),
    },
    {
      header: "Created",
      render: (c) => `<span class="text-slate-400">${escapeHtml(formatDate(c.createdAt))}</span>`,
    },
    {
      header: "",
      render: (c) =>
        `<button hx-delete="/credentials/${c.id}" hx-target="#main-content" hx-confirm="Delete credential &quot;${escapeHtml(c.label)}&quot;?"
          class="rounded-lg bg-red-400/10 px-3 py-1 text-xs font-medium text-red-400 ring-1 ring-inset ring-red-400/20 hover:bg-red-400/20 transition-colors">
          Delete
        </button>`,
      align: "right",
    },
  ];

  const tableHtml =
    credentials.length > 0
      ? table(columns, credentials)
      : `<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-10">
          <p class="text-sm text-slate-400">No credentials configured yet.</p>
        </div>`;

  // ---------- Add form ----------
  const formHtml = `
<div class="rounded-xl border border-slate-700 bg-slate-800 p-6 mt-6">
  <h2 class="text-base font-semibold text-slate-50 mb-4">Add Credential</h2>
  <form hx-post="/credentials" hx-target="#main-content">
    <div class="flex gap-4 flex-wrap items-end">
      <div class="flex-1 min-w-[180px] space-y-1.5">
        <label class="block text-sm font-medium text-slate-300">Label</label>
        <input type="text" name="label" required placeholder="e.g. my-github-pat"
          class="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
      </div>
      <div class="min-w-[160px] space-y-1.5">
        <label class="block text-sm font-medium text-slate-300">Provider</label>
        <select name="provider" required
          class="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500">
          <option value="github">GitHub</option>
          <option value="azuredevops">Azure DevOps</option>
        </select>
      </div>
      <div class="flex-1 min-w-[220px] space-y-1.5">
        <label class="block text-sm font-medium text-slate-300">Personal Access Token</label>
        <input type="password" name="token" required placeholder="ghp_..."
          class="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
      </div>
      <div>
        <button type="submit"
          class="inline-flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-400">
          Add
        </button>
      </div>
    </div>
  </form>
</div>`;

  return flashHtml +
    `<h2 class="text-2xl font-bold text-slate-50 mb-6">Credentials</h2>` +
    tableHtml +
    formHtml;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Render the full credentials page (with layout shell).
 */
export function credentialsPage(data: CredentialsPageData): string {
  return layout({
    title: "Credentials",
    content: credentialContent(data),
    userName: data.userName,
    activeNav: "credentials",
  });
}

/**
 * Render just the content fragment (for HTMX partial updates).
 */
export function credentialsFragment(data: CredentialsPageData): string {
  return credentialContent(data);
}
