/**
 * HTTP API routes for machine-to-machine integration (e.g. Hive).
 *
 * Auth: Bearer token via PRISM_API_KEY environment variable.
 * Body: JSON (express.json() must be applied before these routes).
 *
 * Routes:
 *   POST /api/projects/:slug/search   — semantic search, returns JSON
 *   POST /api/projects/:slug/reindex  — enqueue reindex, returns 202
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import {
  getProjectBySlug,
  getConfig,
  createEmbedder,
  similaritySearch,
  getFindingsByProjectId,
  upsertReindexRequest,
  verifyApiKey,
  logger,
} from "@prism/core";

export const apiRouter = Router();

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  // 1. Check DB-managed keys (hash-based lookup, updates last_used_at)
  try {
    const validInDb = await verifyApiKey(token);
    if (validInDb) {
      next();
      return;
    }
  } catch (err) {
    logger.warn({ err }, "verifyApiKey DB lookup failed, falling back to env var");
  }

  // 2. Fallback: compare against PRISM_API_KEY env var (backward compat)
  const envKey = process.env.PRISM_API_KEY;
  if (envKey && token === envKey) {
    next();
    return;
  }

  res.status(401).json({ error: "Invalid API key" });
}

// ---------------------------------------------------------------------------
// POST /api/projects/:slug/search
// ---------------------------------------------------------------------------

apiRouter.post("/api/projects/:slug/search", requireApiKey, async (req, res) => {
  const slug = decodeURIComponent(String(req.params.slug));

  const project = await getProjectBySlug(slug);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  if (project.indexStatus !== "completed" && project.indexStatus !== "partial") {
    res.status(404).json({ error: "Project not yet indexed" });
    return;
  }

  const { query, maxResults = 20, maxSummaries = 30, maxFindings = 20 } = req.body as {
    query?: unknown;
    maxResults?: number;
    maxSummaries?: number;
    maxFindings?: number;
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

    const allFindings = await getFindingsByProjectId(project.id);
    const findings = allFindings
      .filter((f) => ["critical", "high", "medium"].includes(f.severity))
      .slice(0, maxFindings)
      .map((f) => ({
        category: f.category,
        severity: f.severity,
        title: f.title,
        description: f.description,
        suggestion: f.suggestion ?? null,
      }));

    res.json({ relevantCode, moduleSummaries, findings });
  } catch (err) {
    logger.error(
      { slug, error: err instanceof Error ? err.message : String(err) },
      "API search failed",
    );
    res.status(500).json({ error: "Search failed" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/projects/:slug/reindex
// ---------------------------------------------------------------------------

apiRouter.post("/api/projects/:slug/reindex", requireApiKey, async (req, res) => {
  const slug = decodeURIComponent(String(req.params.slug));

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
  const validLayers = new Set(["structural", "semantic"]);
  const invalid = layers.filter((l) => !validLayers.has(l));
  if (invalid.length > 0) {
    res.status(400).json({ error: `Invalid layer(s): ${invalid.join(", ")}` });
    return;
  }

  await upsertReindexRequest(project.id, layers);
  logger.info({ slug, projectId: project.id, layers }, "Reindex request queued");

  res.status(202).json({ queued: true });
});
