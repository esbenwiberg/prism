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
    ? `<div class="rounded-lg border border-red-400/30 bg-red-400/5 px-4 py-3 mb-4 text-sm text-red-400">${escapeHtml(error)}</div>`
    : "";

  const credentialOptions = credentials
    .map(
      (c) =>
        `<option value="${c.id}">${escapeHtml(c.label)} (${escapeHtml(c.provider)})</option>`,
    )
    .join("\n");

  return `
${errorHtml}
<h2 class="text-2xl font-bold text-slate-50 mb-6">Add Project</h2>
<div class="rounded-xl border border-slate-700 bg-slate-800 p-6 max-w-2xl">
  <form hx-post="/projects" hx-target="#main-content">
    <div class="space-y-5">
      <div class="space-y-1.5">
        <label class="block text-sm font-medium text-slate-300">Git URL (HTTPS)</label>
        <input type="url" name="gitUrl" required placeholder="https://github.com/org/repo.git"
          id="git-url-input"
          class="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
        <p class="text-xs text-slate-500">Supported: GitHub and Azure DevOps HTTPS URLs.</p>
      </div>
      <div class="space-y-1.5">
        <label class="block text-sm font-medium text-slate-300">Project Name</label>
        <input type="text" name="name" placeholder="Auto-derived from URL if blank"
          id="project-name-input"
          class="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 placeholder-slate-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
        <p class="text-xs text-slate-500">Leave blank to derive from the repository URL.</p>
      </div>
      <div class="space-y-1.5">
        <label class="block text-sm font-medium text-slate-300">Credential</label>
        <select name="credentialId"
          class="block w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-50 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500">
          <option value="">None (public repository)</option>
          ${credentialOptions}
        </select>
        <p class="text-xs text-slate-500">Select a stored PAT for private repositories.</p>
      </div>
      <div class="flex items-center gap-4 pt-2">
        <button type="submit"
          class="inline-flex items-center gap-2 rounded-lg bg-purple-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-400">
          Create Project
        </button>
        <a href="/"
          hx-get="/"
          hx-target="#main-content"
          hx-push-url="true"
          class="text-sm text-slate-400 hover:text-slate-300 transition-colors">
          Cancel
        </a>
      </div>
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
