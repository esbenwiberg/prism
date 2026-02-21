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
    ? `<div style="background:#dcfce7;color:#166534;padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:0.875rem;">${escapeHtml(flash)}</div>`
    : "";

  // ---------- Table ----------
  const columns: TableColumn<CredentialRow>[] = [
    {
      header: "Label",
      render: (c) => escapeHtml(c.label),
    },
    {
      header: "Provider",
      render: (c) => providerBadge(c.provider),
    },
    {
      header: "Created",
      render: (c) => escapeHtml(formatDate(c.createdAt)),
    },
    {
      header: "",
      render: (c) =>
        `<button hx-delete="/credentials/${c.id}" hx-target="#main-content" hx-confirm="Delete credential &quot;${escapeHtml(c.label)}&quot;?" style="background:#fee2e2;color:#991b1b;border:none;padding:4px 12px;border-radius:4px;cursor:pointer;font-size:0.75rem;font-weight:600;">Delete</button>`,
      align: "right",
    },
  ];

  const tableHtml =
    credentials.length > 0
      ? table(columns, credentials)
      : `<p style="color:#6b7280;">No credentials configured yet.</p>`;

  // ---------- Add form ----------
  const formHtml = `
<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-top:24px;">
  <h2 style="font-size:1.125rem;font-weight:600;margin-bottom:12px;">Add Credential</h2>
  <form hx-post="/credentials" hx-target="#main-content">
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;">
      <div style="flex:1;min-width:180px;">
        <label style="display:block;font-size:0.75rem;font-weight:600;color:#6b7280;margin-bottom:4px;">Label</label>
        <input type="text" name="label" required placeholder="e.g. my-github-pat"
          style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;" />
      </div>
      <div style="min-width:160px;">
        <label style="display:block;font-size:0.75rem;font-weight:600;color:#6b7280;margin-bottom:4px;">Provider</label>
        <select name="provider" required
          style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;background:#fff;">
          <option value="github">GitHub</option>
          <option value="azuredevops">Azure DevOps</option>
        </select>
      </div>
      <div style="flex:1;min-width:220px;">
        <label style="display:block;font-size:0.75rem;font-weight:600;color:#6b7280;margin-bottom:4px;">Personal Access Token</label>
        <input type="password" name="token" required placeholder="ghp_..."
          style="width:100%;padding:6px 10px;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;" />
      </div>
      <div>
        <button type="submit"
          style="background:#2563eb;color:#fff;border:none;padding:7px 16px;border-radius:4px;cursor:pointer;font-size:0.875rem;font-weight:600;">
          Add
        </button>
      </div>
    </div>
  </form>
</div>`;

  return flashHtml +
    `<h1 class="page-title">Credentials</h1>` +
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
