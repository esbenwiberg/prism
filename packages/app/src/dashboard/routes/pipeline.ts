/**
 * Pipeline page route — /projects/:id/pipeline
 */

import { Router } from "express";
import {
  getProject,
  getIndexRunsByProjectId,
  type IndexRunRow,
} from "@prism/core";
import type { LayerName } from "@prism/core";
import { pipelinePage, pipelineFragment, pipelineInfoPage, type LayerRunData } from "../views/pipeline.js";

export const pipelineRouter = Router();

pipelineRouter.get("/pipeline", (req, res) => {
  const userName = req.session.user?.name ?? "User";
  res.send(pipelineInfoPage(userName));
});

pipelineRouter.get("/projects/:id/pipeline", async (req, res) => {
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

  const runs = await getIndexRunsByProjectId(id);
  const layerRuns = latestRunsByLayer(runs);
  const userName = req.session.user?.name ?? "User";

  const data = {
    projectId: id,
    projectName: project.name,
    userName,
    layerRuns,
  };

  if (req.headers["hx-request"]) {
    res.send(pipelineFragment(data));
    return;
  }

  res.send(pipelinePage(data));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reduce an ordered array of index runs to the most recent run per layer.
 */
function latestRunsByLayer(
  runs: IndexRunRow[],
): Partial<Record<LayerName, LayerRunData>> {
  const result: Partial<Record<LayerName, LayerRunData>> = {};

  for (const run of runs) {
    result[run.layer as LayerName] = {
      status: run.status,
      filesProcessed: run.filesProcessed ?? 0,
      filesTotal: run.filesTotal ?? 0,
      durationMs: run.durationMs ?? null,
      costUsd: run.costUsd ?? null,
      error: run.error ?? null,
      completedAt: run.completedAt ?? null,
    };
  }

  return result;
}
