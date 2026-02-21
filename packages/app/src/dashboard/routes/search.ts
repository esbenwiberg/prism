/**
 * Search route — GET /projects/:id/search
 *
 * Provides HTMX-powered semantic search across a project's indexed symbols.
 */

import { Router } from "express";
import {
  getProject,
  getConfig,
  simpleSimilaritySearch,
  createEmbedder,
  logger,
} from "@prism/core";
import {
  searchPage,
  searchFragment,
  type SearchResultViewData,
} from "../views/index.js";

export const searchRouter = Router();

searchRouter.get("/projects/:id/search", async (req, res) => {
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

  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const userName = req.session.user?.name ?? "User";

  let results: SearchResultViewData[] = [];

  if (query.length > 0) {
    try {
      const config = getConfig();
      const embedder = createEmbedder(config.semantic);
      const vectors = await embedder.embed([query]);
      const queryVector = vectors[0];

      const dbResults = await simpleSimilaritySearch(id, queryVector, 10);
      results = dbResults.map((r) => ({
        score: r.score,
        filePath: r.filePath,
        symbolName: r.symbolName,
        symbolKind: r.symbolKind,
        summaryContent: r.summaryContent,
      }));
    } catch (err) {
      logger.warn(
        { error: err instanceof Error ? err.message : String(err) },
        "Search failed — embedding provider may not be configured",
      );
      // Return empty results rather than error page
    }
  }

  const data = {
    projectId: id,
    projectName: project.name,
    query,
    results,
    userName,
  };

  if (req.headers["hx-request"]) {
    res.send(searchFragment(data));
    return;
  }

  res.send(searchPage(data));
});
