/**
 * Add Project page — form for creating a project from a git URL.
 *
 * Credential dropdown is populated from prism_credentials.
 */

import type { CredentialRow } from "@prism/core";
import { layout } from "./layout.js";
import { escapeHtml } from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AddProjectPageData {
  credentials: CredentialRow[];
  userName: string;
  /** Optional error message shown after failed submission. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

function addProjectContent(data: AddProjectPageData): string {
  const { credentials, error } = data;

  const errorHtml = error
    ? `<div style="background:#fee2e2;color:#991b1b;padding:12px 16px;border-radius:8px;margin-bottom:16px;font-size:0.875rem;">${escapeHtml(error)}</div>`
    : "";

  const credentialOptions = credentials
    .map(
      (c) =>
        `<option value="${c.id}">${escapeHtml(c.label)} (${escapeHtml(c.provider)})</option>`,
    )
    .join("\n");

  return `
${errorHtml}
<h1 class="page-title">Add Project</h1>
<div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:24px;max-width:600px;">
  <form hx-post="/projects" hx-target="#main-content">
    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:0.75rem;font-weight:600;color:#6b7280;margin-bottom:4px;">Git URL (HTTPS)</label>
      <input type="url" name="gitUrl" required placeholder="https://github.com/org/repo.git"
        id="git-url-input"
        style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;" />
      <p style="font-size:0.75rem;color:#9ca3af;margin-top:4px;">Supported: GitHub and Azure DevOps HTTPS URLs.</p>
    </div>
    <div style="margin-bottom:16px;">
      <label style="display:block;font-size:0.75rem;font-weight:600;color:#6b7280;margin-bottom:4px;">Project Name</label>
      <input type="text" name="name" placeholder="Auto-derived from URL if blank"
        id="project-name-input"
        style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;" />
      <p style="font-size:0.75rem;color:#9ca3af;margin-top:4px;">Leave blank to derive from the repository URL.</p>
    </div>
    <div style="margin-bottom:20px;">
      <label style="display:block;font-size:0.75rem;font-weight:600;color:#6b7280;margin-bottom:4px;">Credential</label>
      <select name="credentialId"
        style="width:100%;padding:8px 12px;border:1px solid #d1d5db;border-radius:4px;font-size:0.875rem;background:#fff;">
        <option value="">None (public repository)</option>
        ${credentialOptions}
      </select>
      <p style="font-size:0.75rem;color:#9ca3af;margin-top:4px;">Select a stored PAT for private repositories.</p>
    </div>
    <div style="display:flex;gap:12px;align-items:center;">
      <button type="submit"
        style="background:#2563eb;color:#fff;border:none;padding:8px 20px;border-radius:4px;cursor:pointer;font-size:0.875rem;font-weight:600;">
        Create Project
      </button>
      <a href="/"
        hx-get="/"
        hx-target="#main-content"
        hx-push-url="true"
        style="font-size:0.875rem;color:#6b7280;text-decoration:none;">
        Cancel
      </a>
    </div>
  </form>
</div>
<script>
  // Auto-derive project name from git URL
  document.getElementById('git-url-input')?.addEventListener('input', function() {
    var nameInput = document.getElementById('project-name-input');
    if (nameInput && !nameInput.dataset.userEdited) {
      var url = this.value.trim();
      var match = url.match(/\\/([^\\/]+?)(?:\\.git)?$/);
      if (match) {
        nameInput.value = match[1];
      }
    }
  });
  document.getElementById('project-name-input')?.addEventListener('input', function() {
    this.dataset.userEdited = this.value ? 'true' : '';
  });
</script>`;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Render the full "Add Project" page (with layout shell).
 */
export function addProjectPage(data: AddProjectPageData): string {
  return layout({
    title: "Add Project",
    content: addProjectContent(data),
    userName: data.userName,
    activeNav: "overview",
  });
}

/**
 * Render just the content fragment (for HTMX partial updates).
 */
export function addProjectFragment(data: AddProjectPageData): string {
  return addProjectContent(data);
}
