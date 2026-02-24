/**
 * Purpose page — Layer 2.5 structured app-purpose document.
 *
 * Renders the single purpose-level summary as a set of section cards,
 * one per ## heading in the markdown document.
 */

import { layout } from "./layout.js";
import { escapeHtml, card, projectTabNav } from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PurposePageData {
  projectId: number;
  projectName: string;
  /** Full markdown content of the purpose document, or null if not indexed. */
  content: string | null;
  userName: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


/**
 * Split a markdown document on ## headings, returning an array of
 * { title, body } objects. Content before the first ## becomes an
 * "Overview" section.
 */
function parseSections(
  content: string,
): Array<{ title: string; body: string }> {
  const parts = content.split(/\n(?=## )/);
  return parts
    .map((part) => {
      const firstLine = part.split("\n")[0].trim();
      if (firstLine.startsWith("## ")) {
        const title = firstLine.slice(3).trim();
        const body = part.slice(firstLine.length).trimStart();
        return { title, body };
      }
      const trimmed = part.trim();
      if (!trimmed) return null;
      return { title: "Overview", body: trimmed };
    })
    .filter((s): s is { title: string; body: string } => s !== null);
}

function renderSections(content: string): string {
  const sections = parseSections(content);
  if (sections.length === 0) {
    return `<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-12">
      <p class="text-sm text-slate-400">Purpose document is empty.</p>
    </div>`;
  }
  return sections
    .map(({ title, body }) =>
      card(
        title,
        `<pre class="whitespace-pre-wrap text-sm text-slate-300 font-sans leading-relaxed">${escapeHtml(body)}</pre>`,
      ),
    )
    .join("");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Render the full purpose page.
 */
export function purposePage(data: PurposePageData): string {
  const { projectId, projectName, content, userName } = data;

  const emptyState = `<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-12 gap-4">
    <p class="text-sm text-slate-400">No purpose document yet.</p>
    <button hx-post="/projects/${projectId}/run-layer"
            hx-vals='{"layer":"purpose"}'
            hx-target="#job-progress"
            hx-swap="outerHTML"
            class="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400 transition-colors">
      Generate Purpose Document
    </button>
    <div id="job-progress"></div>
  </div>`;

  const body = content ? renderSections(content) : emptyState;

  const pageContent =
    projectTabNav(projectId, projectName, "purpose") +
    `<h2 class="text-xl font-semibold text-slate-50 mb-6">Purpose</h2>` +
    body;

  return layout({
    title: `${projectName} — Purpose`,
    content: pageContent,
    userName,
    activeNav: `project-${projectId}`,
  });
}

/**
 * Render just the content fragment (for HTMX partial updates).
 */
export function purposeFragment(data: PurposePageData): string {
  const { projectId, projectName, content } = data;

  const emptyState = `<div class="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 py-12 gap-4">
    <p class="text-sm text-slate-400">No purpose document yet.</p>
    <button hx-post="/projects/${projectId}/run-layer"
            hx-vals='{"layer":"purpose"}'
            hx-target="#job-progress"
            hx-swap="outerHTML"
            class="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-amber-400 transition-colors">
      Generate Purpose Document
    </button>
    <div id="job-progress"></div>
  </div>`;

  const body = content ? renderSections(content) : emptyState;

  return (
    projectTabNav(projectId, projectName, "purpose") +
    `<h2 class="text-xl font-semibold text-slate-50 mb-6">Purpose</h2>` +
    body
  );
}
