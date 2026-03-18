/**
 * Context Explorer routes.
 *
 *   GET  /projects/:id/context        — render the context explorer page
 *   POST /projects/:id/context/query  — execute context assembly, return result fragment
 */

import { Router } from "express";
import {
  getProject,
  assembleFileContext,
  assembleModuleContext,
  assembleRelatedFiles,
  assembleArchitectureOverview,
  assembleChangeContext,
  assembleReviewContext,
  assembleTaskContext,
  formatContextAsMarkdown,
  logger,
  type RelatedFileResult,
} from "@prism/core";
import {
  contextExplorerPage,
  contextExplorerFragment,
} from "../views/context-explorer.js";
import { escapeHtml } from "../views/components.js";

export const contextExplorerRouter = Router();

// ---------------------------------------------------------------------------
// GET /projects/:id/context — render the explorer page
// ---------------------------------------------------------------------------

contextExplorerRouter.get("/projects/:id/context", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).send("Invalid project ID");
    return;
  }

  const project = await getProject(id);
  if (!project) {
    res.status(404).send("Project not found");
    return;
  }

  const userName = req.session.user?.name ?? "User";

  const data = {
    projectId: id,
    projectName: project.name,
    userName,
  };

  if (req.headers["hx-request"]) {
    res.send(contextExplorerFragment(data));
    return;
  }

  res.send(contextExplorerPage(data));
});

// ---------------------------------------------------------------------------
// POST /projects/:id/context/query — execute context assembly
// ---------------------------------------------------------------------------

contextExplorerRouter.post("/projects/:id/context/query", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).send(errorFragment("Invalid project ID"));
    return;
  }

  const project = await getProject(id);
  if (!project) {
    res.status(404).send(errorFragment("Project not found"));
    return;
  }

  const contextType = req.body.contextType as string;

  try {
    switch (contextType) {
      case "file": {
        const filePath = req.body.filePath as string;
        if (!filePath) {
          res.send(errorFragment("File path is required."));
          return;
        }
        const intent = (req.body.intent as string) || undefined;
        const maxTokens = parseIntOrDefault(req.body.maxTokens, 4000);
        const response = await assembleFileContext({ projectId: id, filePath, intent, maxTokens });
        res.send(contextResponseFragment(response));
        return;
      }

      case "module": {
        const modulePath = req.body.modulePath as string;
        if (!modulePath) {
          res.send(errorFragment("Module path is required."));
          return;
        }
        const maxTokens = parseIntOrDefault(req.body.maxTokens, 3000);
        const response = await assembleModuleContext({ projectId: id, modulePath, maxTokens });
        res.send(contextResponseFragment(response));
        return;
      }

      case "related": {
        const query = req.body.query as string;
        if (!query) {
          res.send(errorFragment("Query is required."));
          return;
        }
        const maxResults = parseIntOrDefault(req.body.maxResults, 15);
        const includeTests = req.body.includeTests === "true";
        const results = await assembleRelatedFiles({ projectId: id, query, maxResults, includeTests });
        res.send(relatedFilesFragment(results));
        return;
      }

      case "architecture": {
        const maxTokens = parseIntOrDefault(req.body.maxTokens, 5000);
        const response = await assembleArchitectureOverview({ projectId: id, maxTokens });
        res.send(contextResponseFragment(response));
        return;
      }

      case "change": {
        const filePath = (req.body.filePath as string) || undefined;
        const modulePath = (req.body.modulePath as string) || undefined;
        const since = (req.body.since as string) || undefined;
        const until = (req.body.until as string) || undefined;
        const maxCommits = parseIntOrDefault(req.body.maxCommits, 20);
        const maxTokens = parseIntOrDefault(req.body.maxTokens, 4000);
        const response = await assembleChangeContext({
          projectId: id,
          filePath,
          modulePath,
          since,
          until,
          maxCommits,
          maxTokens,
        });
        res.send(contextResponseFragment(response));
        return;
      }

      case "review": {
        const since = req.body.since as string;
        if (!since) {
          res.send(errorFragment("Since date is required for review context."));
          return;
        }
        const until = (req.body.until as string) || undefined;
        const maxTokens = parseIntOrDefault(req.body.maxTokens, 8000);
        const response = await assembleReviewContext({ projectId: id, since, until, maxTokens });
        res.send(contextResponseFragment(response));
        return;
      }

      case "enrich": {
        const query = req.body.query as string;
        if (!query) {
          res.send(errorFragment("Query is required."));
          return;
        }
        const maxTokens = parseIntOrDefault(req.body.maxTokens, 16000);
        const response = await assembleTaskContext({ projectId: id, query, maxTokens });
        res.send(contextResponseFragment(response));
        return;
      }

      default:
        res.send(errorFragment(`Unknown context type: ${contextType}`));
        return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { projectId: id, contextType, error: message },
      "Context assembly failed",
    );
    res.send(errorFragment(`Context assembly failed: ${message}`));
  }
});

// ---------------------------------------------------------------------------
// Fragment helpers
// ---------------------------------------------------------------------------

function parseIntOrDefault(value: unknown, defaultValue: number): number {
  if (value == null || value === "") return defaultValue;
  const parsed = parseInt(String(value), 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function errorFragment(message: string): string {
  return `<div class="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
  <p class="text-sm text-red-400">${escapeHtml(message)}</p>
</div>`;
}

function contextResponseFragment(response: { sections: { heading: string; priority: number; content: string; tokenCount: number }[]; totalTokens: number; truncated: boolean }): string {
  const markdown = formatContextAsMarkdown(response);
  return `<div class="space-y-3">
  <div class="flex gap-4 text-xs text-slate-400">
    <span>Tokens: ${response.totalTokens}</span>
    <span>Sections: ${response.sections.length}</span>
    ${response.truncated ? '<span class="text-amber-400">Truncated</span>' : ""}
  </div>
  <pre class="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap max-h-[70vh] overflow-y-auto">${escapeHtml(markdown)}</pre>
</div>`;
}

function relatedFilesFragment(results: RelatedFileResult[]): string {
  if (results.length === 0) {
    return `<p class="text-sm text-slate-400">No related files found. Try a different query.</p>`;
  }

  const rows = results
    .map((r) => {
      const scorePct = (r.score * 100).toFixed(1);
      const scoreColor =
        r.score >= 0.6 ? "text-emerald-400" : r.score >= 0.3 ? "text-blue-400" : "text-slate-400";
      const summary =
        r.summary.length > 120 ? r.summary.slice(0, 120) + "..." : r.summary;
      return `<tr class="hover:bg-slate-800/50">
      <td class="whitespace-nowrap px-4 py-2.5 text-sm">
        <span class="font-mono text-xs text-slate-200">${escapeHtml(r.path)}</span>
      </td>
      <td class="whitespace-nowrap px-4 py-2.5 text-sm text-center">
        <span class="${scoreColor} font-medium">${scorePct}%</span>
      </td>
      <td class="whitespace-nowrap px-4 py-2.5 text-xs text-slate-400">${escapeHtml(r.relationship)}</td>
      <td class="px-4 py-2.5 text-xs text-slate-500 max-w-md truncate">${escapeHtml(summary)}</td>
    </tr>`;
    })
    .join("");

  return `<div class="space-y-3">
  <div class="flex gap-4 text-xs text-slate-400">
    <span>Results: ${results.length}</span>
  </div>
  <div class="overflow-x-auto">
    <table class="min-w-full divide-y divide-slate-700">
      <thead class="bg-slate-800/50">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Path</th>
          <th class="px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-slate-400">Score</th>
          <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Relationship</th>
          <th class="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Summary</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-700">${rows}</tbody>
    </table>
  </div>
</div>`;
}
