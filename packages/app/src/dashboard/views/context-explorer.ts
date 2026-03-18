/**
 * Context Explorer view — interactive context assembly for a project.
 *
 * Users pick a context type (file, module, related, architecture, change, review),
 * fill in type-specific fields, and submit via HTMX to see the assembled
 * context rendered as markdown.
 */

import { layout } from "./layout.js";
import { escapeHtml, card, input, select, checkbox, button, projectTabNav } from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContextExplorerPageData {
  projectId: number;
  projectName: string;
  userName: string;
  result?: string;
  resultMeta?: { totalTokens: number; truncated: boolean; sections: number };
}

// ---------------------------------------------------------------------------
// Context type options
// ---------------------------------------------------------------------------

const CONTEXT_TYPES = [
  { value: "file", label: "File Context" },
  { value: "module", label: "Module Context" },
  { value: "related", label: "Related Files" },
  { value: "architecture", label: "Architecture Overview" },
  { value: "change", label: "Change Context" },
  { value: "review", label: "Review Context" },
  { value: "enrich", label: "Task Context (Enrich)" },
];

// ---------------------------------------------------------------------------
// Dynamic field groups
// ---------------------------------------------------------------------------

function fileFields(): string {
  return `<div class="space-y-4">
  ${input("filePath", "File Path", { required: true, placeholder: "src/index.ts" })}
  ${input("intent", "Intent (optional)", { placeholder: "e.g. understand auth flow" })}
  ${input("maxTokens", "Max Tokens", { type: "number", value: "4000" })}
</div>`;
}

function moduleFields(): string {
  return `<div class="space-y-4">
  ${input("modulePath", "Module Path", { required: true, placeholder: "src/db" })}
  ${input("maxTokens", "Max Tokens", { type: "number", value: "3000" })}
</div>`;
}

function relatedFields(): string {
  return `<div class="space-y-4">
  ${input("query", "Query", { required: true, placeholder: "authentication middleware" })}
  ${input("maxResults", "Max Results", { type: "number", value: "15" })}
  <div class="pt-1">
    ${checkbox("includeTests", "Include test files", false)}
  </div>
</div>`;
}

function architectureFields(): string {
  return `<div class="space-y-4">
  ${input("maxTokens", "Max Tokens", { type: "number", value: "5000" })}
</div>`;
}

function changeFields(): string {
  return `<div class="space-y-4">
  ${input("filePath", "File Path (optional)", { placeholder: "src/index.ts" })}
  ${input("modulePath", "Module Path (optional)", { placeholder: "src/db" })}
  ${input("since", "Since", { type: "date" })}
  ${input("until", "Until", { type: "date" })}
  ${input("maxCommits", "Max Commits", { type: "number", value: "20" })}
  ${input("maxTokens", "Max Tokens", { type: "number", value: "4000" })}
</div>`;
}

function reviewFields(): string {
  return `<div class="space-y-4">
  ${input("since", "Since", { type: "date", required: true })}
  ${input("until", "Until (optional)", { type: "date" })}
  ${input("maxTokens", "Max Tokens", { type: "number", value: "8000" })}
</div>`;
}

function enrichFields(): string {
  return `<div class="space-y-4">
  ${input("query", "Query", { required: true, placeholder: "How does the auth middleware work?" })}
  ${input("maxTokens", "Max Tokens", { type: "number", value: "16000" })}
</div>`;
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function contextForm(projectId: number): string {
  const typeDropdown = select("contextType", "Context Type", CONTEXT_TYPES, "file",
    `onchange="switchContextFields(this.value)"`);

  return `
<form hx-post="/projects/${projectId}/context/query"
      hx-target="#context-result"
      hx-swap="innerHTML"
      hx-indicator="#context-spinner"
      class="space-y-5">
  ${typeDropdown}

  <div id="fields-file">${fileFields()}</div>
  <div id="fields-module" class="hidden">${moduleFields()}</div>
  <div id="fields-related" class="hidden">${relatedFields()}</div>
  <div id="fields-architecture" class="hidden">${architectureFields()}</div>
  <div id="fields-change" class="hidden">${changeFields()}</div>
  <div id="fields-review" class="hidden">${reviewFields()}</div>
  <div id="fields-enrich" class="hidden">${enrichFields()}</div>

  <div class="flex items-center gap-3 pt-2">
    ${button("Assemble Context", { attrs: 'type="submit"' })}
    <svg id="context-spinner" class="htmx-indicator h-5 w-5 animate-spin text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
    </svg>
  </div>
</form>`;
}

// ---------------------------------------------------------------------------
// Result area
// ---------------------------------------------------------------------------

function resultArea(data: ContextExplorerPageData): string {
  if (!data.result) {
    return `<p class="text-sm text-slate-500">Select a context type, fill in the parameters, and click "Assemble Context" to see the result here.</p>`;
  }

  const meta = data.resultMeta;
  const metaHtml = meta
    ? `<div class="flex gap-4 text-xs text-slate-400 mb-3">
        <span>Tokens: ${meta.totalTokens}</span>
        <span>Sections: ${meta.sections}</span>
        ${meta.truncated ? '<span class="text-amber-400">Truncated</span>' : ""}
      </div>`
    : "";

  return `${metaHtml}<pre class="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-[70vh] overflow-y-auto">${escapeHtml(data.result)}</pre>`;
}

// ---------------------------------------------------------------------------
// Client-side script
// ---------------------------------------------------------------------------

const clientScript = `
<script>
  function switchContextFields(type) {
    var groups = ['file', 'module', 'related', 'architecture', 'change', 'review', 'enrich'];
    for (var i = 0; i < groups.length; i++) {
      var el = document.getElementById('fields-' + groups[i]);
      if (el) {
        if (groups[i] === type) {
          el.classList.remove('hidden');
          // Enable inputs so they get submitted
          var inputs = el.querySelectorAll('input, select, textarea');
          for (var j = 0; j < inputs.length; j++) inputs[j].removeAttribute('disabled');
        } else {
          el.classList.add('hidden');
          // Disable hidden inputs so they don't get submitted
          var inputs = el.querySelectorAll('input, select, textarea');
          for (var j = 0; j < inputs.length; j++) inputs[j].setAttribute('disabled', 'true');
        }
      }
    }
  }
  // Run on load to disable hidden field groups
  switchContextFields(document.getElementById('contextType')?.value || 'file');
</script>`;

// ---------------------------------------------------------------------------
// Full page
// ---------------------------------------------------------------------------

function contentHtml(data: ContextExplorerPageData): string {
  const { projectId, projectName } = data;

  return (
    projectTabNav(projectId, projectName, "context") +
    `<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
  <div>
    ${card("Query", contextForm(projectId))}
  </div>
  <div class="lg:col-span-2">
    ${card("Result", `<div id="context-result">${resultArea(data)}</div>`)}
  </div>
</div>` +
    clientScript
  );
}

/**
 * Render the full context explorer page (with layout shell).
 */
export function contextExplorerPage(data: ContextExplorerPageData): string {
  return layout({
    title: `${data.projectName} — Context Explorer`,
    content: contentHtml(data),
    userName: data.userName,
    activeNav: `project-${data.projectId}`,
  });
}

/**
 * Render just the content fragment (for HTMX partial updates).
 */
export function contextExplorerFragment(data: ContextExplorerPageData): string {
  return contentHtml(data);
}
