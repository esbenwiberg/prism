/**
 * HTTP API routes for machine-to-machine integration (e.g. Hive).
 *
 * Auth: Bearer token via PRISM_API_KEY environment variable.
 * Body: JSON (express.json() must be applied before these routes).
 *
 * Routes:
 *   POST   /api/projects/:slug/search    — semantic search, returns JSON
 *   GET    /api/projects/:slug/findings   — static analysis findings
 *   POST   /api/projects/:slug/reindex    — enqueue reindex, returns 202
 *   DELETE /api/projects/:slug             — delete project
 */

import { Router } from "express";
import {
  getProjectBySlug,
  getConfig,
  createEmbedder,
  similaritySearch,
  getFindingsByProjectId,
  upsertReindexRequest,
  deleteProject,
  logger,
  assembleFileContext,
  assembleModuleContext,
  assembleRelatedFiles,
  assembleArchitectureOverview,
  assembleChangeContext,
  assembleReviewContext,
  formatContextAsMarkdown,
} from "@prism/core";
import { requireApiKey, requirePermission } from "../../auth/api-key.js";

export const apiRouter = Router();

// ---------------------------------------------------------------------------
// POST /api/projects/:slug/search
// ---------------------------------------------------------------------------

apiRouter.post("/api/projects/:owner/:repo/search", requireApiKey, requirePermission("read"), async (req, res) => {
  const slug = `${req.params.owner}/${req.params.repo}`;

  const project = await getProjectBySlug(slug);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  if (project.indexStatus !== "completed" && project.indexStatus !== "partial") {
    res.status(404).json({ error: "Project not yet indexed" });
    return;
  }

  const { query, maxResults = 20, maxSummaries = 30 } = req.body as {
    query?: unknown;
    maxResults?: number;
    maxSummaries?: number;
  };

  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "query must be a non-empty string" });
    return;
  }

  try {
    const config = getConfig();
    const embedder = createEmbedder(config.semantic);
    const [queryVector] = await embedder.embed([query]);

    // Run one search, then split results by level
    const searchLimit = maxResults + maxSummaries;
    const allResults = await similaritySearch(project.id, queryVector, searchLimit);

    const relevantCode = allResults
      .filter((r) => r.level !== "module" && r.level !== "system")
      .slice(0, maxResults)
      .map((r) => ({
        targetId: r.targetId,
        filePath: r.filePath,
        symbolName: r.symbolName,
        symbolKind: r.symbolKind,
        level: r.level,
        summary: r.summaryContent,
        score: r.score,
      }));

    const moduleSummaries = allResults
      .filter((r) => r.level === "module")
      .slice(0, maxSummaries)
      .map((r) => ({
        targetId: r.targetId,
        content: r.summaryContent,
      }));

    res.json({ relevantCode, moduleSummaries });
  } catch (err) {
    logger.error(
      { slug, error: err instanceof Error ? err.message : String(err) },
      "API search failed",
    );
    res.status(500).json({ error: "Search failed" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/projects/:slug/findings
// ---------------------------------------------------------------------------

apiRouter.get("/api/projects/:owner/:repo/findings", requireApiKey, requirePermission("read"), async (req, res) => {
  const slug = `${req.params.owner}/${req.params.repo}`;

  const project = await getProjectBySlug(slug);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const severity = (req.query.severity as string | undefined)?.split(",") ?? ["critical", "high", "medium"];
  const maxFindings = Math.min(Number(req.query.limit) || 50, 200);

  try {
    const allFindings = await getFindingsByProjectId(project.id);
    const findings = allFindings
      .filter((f) => severity.includes(f.severity))
      .slice(0, maxFindings)
      .map((f) => ({
        category: f.category,
        severity: f.severity,
        title: f.title,
        description: f.description,
        suggestion: f.suggestion ?? null,
      }));

    res.json({ findings });
  } catch (err) {
    logger.error(
      { slug, error: err instanceof Error ? err.message : String(err) },
      "API findings fetch failed",
    );
    res.status(500).json({ error: "Failed to fetch findings" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:slug/reindex
// ---------------------------------------------------------------------------

apiRouter.post("/api/projects/:owner/:repo/reindex", requireApiKey, requirePermission("index"), async (req, res) => {
  const slug = `${req.params.owner}/${req.params.repo}`;

  const project = await getProjectBySlug(slug);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const rawLayers = (req.body as { layers?: unknown }).layers ?? ["structural"];
  if (!Array.isArray(rawLayers)) {
    res.status(400).json({ error: "layers must be an array" });
    return;
  }

  const layers = rawLayers as string[];
  const validLayers = new Set(["structural", "semantic", "history"]);
  const invalid = layers.filter((l) => !validLayers.has(l));
  if (invalid.length > 0) {
    res.status(400).json({ error: `Invalid layer(s): ${invalid.join(", ")}` });
    return;
  }

  await upsertReindexRequest(project.id, layers);
  logger.info({ slug, projectId: project.id, layers }, "Reindex request queued");

  res.status(202).json({ queued: true });
});

// ---------------------------------------------------------------------------
// DELETE /api/projects/:owner/:repo
// ---------------------------------------------------------------------------

apiRouter.delete("/api/projects/:owner/:repo", requireApiKey, requirePermission("register"), async (req, res) => {
  const slug = `${req.params.owner}/${req.params.repo}`;

  const project = await getProjectBySlug(slug);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  await deleteProject(project.id);
  logger.info({ slug, projectId: project.id }, "Project deleted via API");

  res.json({ deleted: true });
});

// ---------------------------------------------------------------------------
// POST /api/projects/:owner/:repo/context/file
// ---------------------------------------------------------------------------

apiRouter.post("/api/projects/:owner/:repo/context/file", requireApiKey, requirePermission("read"), async (req, res) => {
  const slug = `${req.params.owner}/${req.params.repo}`;
  const project = await getProjectBySlug(slug);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const { filePath, intent, maxTokens } = req.body as {
    filePath?: string;
    intent?: string;
    maxTokens?: number;
  };

  if (!filePath || typeof filePath !== "string") {
    res.status(400).json({ error: "filePath must be a non-empty string" });
    return;
  }

  try {
    const response = await assembleFileContext({ projectId: project.id, filePath, intent, maxTokens });
    res.json(response);
  } catch (err) {
    logger.error({ slug, filePath, error: err instanceof Error ? err.message : String(err) }, "Context file failed");
    res.status(500).json({ error: "Context assembly failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:owner/:repo/context/module
// ---------------------------------------------------------------------------

apiRouter.post("/api/projects/:owner/:repo/context/module", requireApiKey, requirePermission("read"), async (req, res) => {
  const slug = `${req.params.owner}/${req.params.repo}`;
  const project = await getProjectBySlug(slug);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const { modulePath, maxTokens } = req.body as {
    modulePath?: string;
    maxTokens?: number;
  };

  if (!modulePath || typeof modulePath !== "string") {
    res.status(400).json({ error: "modulePath must be a non-empty string" });
    return;
  }

  try {
    const response = await assembleModuleContext({ projectId: project.id, modulePath, maxTokens });
    res.json(response);
  } catch (err) {
    logger.error({ slug, modulePath, error: err instanceof Error ? err.message : String(err) }, "Context module failed");
    res.status(500).json({ error: "Context assembly failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:owner/:repo/context/related
// ---------------------------------------------------------------------------

apiRouter.post("/api/projects/:owner/:repo/context/related", requireApiKey, requirePermission("read"), async (req, res) => {
  const slug = `${req.params.owner}/${req.params.repo}`;
  const project = await getProjectBySlug(slug);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const { query, maxResults, includeTests } = req.body as {
    query?: string;
    maxResults?: number;
    includeTests?: boolean;
  };

  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "query must be a non-empty string" });
    return;
  }

  try {
    const results = await assembleRelatedFiles({ projectId: project.id, query, maxResults, includeTests });
    res.json({ results });
  } catch (err) {
    logger.error({ slug, query, error: err instanceof Error ? err.message : String(err) }, "Context related failed");
    res.status(500).json({ error: "Context assembly failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:owner/:repo/context/arch
// ---------------------------------------------------------------------------

apiRouter.post("/api/projects/:owner/:repo/context/arch", requireApiKey, requirePermission("read"), async (req, res) => {
  const slug = `${req.params.owner}/${req.params.repo}`;
  const project = await getProjectBySlug(slug);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const { maxTokens } = req.body as { maxTokens?: number };

  try {
    const response = await assembleArchitectureOverview({ projectId: project.id, maxTokens });
    res.json(response);
  } catch (err) {
    logger.error({ slug, error: err instanceof Error ? err.message : String(err) }, "Context arch failed");
    res.status(500).json({ error: "Context assembly failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:owner/:repo/context/changes
// ---------------------------------------------------------------------------

apiRouter.post("/api/projects/:owner/:repo/context/changes", requireApiKey, requirePermission("read"), async (req, res) => {
  const slug = `${req.params.owner}/${req.params.repo}`;
  const project = await getProjectBySlug(slug);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const { filePath, modulePath, since, until, maxCommits, maxTokens } = req.body as {
    filePath?: string;
    modulePath?: string;
    since?: string;
    until?: string;
    maxCommits?: number;
    maxTokens?: number;
  };

  try {
    const response = await assembleChangeContext({
      projectId: project.id,
      filePath,
      modulePath,
      since,
      until,
      maxCommits,
      maxTokens,
    });
    res.json(response);
  } catch (err) {
    logger.error({ slug, error: err instanceof Error ? err.message : String(err) }, "Context changes failed");
    res.status(500).json({ error: "Context assembly failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:owner/:repo/context/review
// ---------------------------------------------------------------------------

apiRouter.post("/api/projects/:owner/:repo/context/review", requireApiKey, requirePermission("read"), async (req, res) => {
  const slug = `${req.params.owner}/${req.params.repo}`;
  const project = await getProjectBySlug(slug);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  const { since, until, maxTokens } = req.body as {
    since?: string;
    until?: string;
    maxTokens?: number;
  };

  if (!since || typeof since !== "string") {
    res.status(400).json({ error: "since must be a non-empty ISO date string" });
    return;
  }

  try {
    const response = await assembleReviewContext({
      projectId: project.id,
      since,
      until,
      maxTokens,
    });
    res.json(response);
  } catch (err) {
    logger.error({ slug, error: err instanceof Error ? err.message : String(err) }, "Context review failed");
    res.status(500).json({ error: "Context assembly failed" });
  }
});
