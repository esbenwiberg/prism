/**
 * Summaries route — GET /projects/:id/summaries
 *
 * Lists AI-generated summaries for a project, filtered by level.
 * The "purpose" level has its own dedicated page.
 */

import { Router } from "express";
import { getProject, getSummariesByLevel } from "@prism/core";
import {
  summariesPage,
  summariesFragment,
  type SummaryViewData,
} from "../views/index.js";

export const summariesRouter = Router();

const VALID_LEVELS = new Set(["function", "file", "module", "system"]);

summariesRouter.get("/projects/:id/summaries", async (req, res) => {
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

  const levelFilter =
    typeof req.query.level === "string" && VALID_LEVELS.has(req.query.level)
      ? req.query.level
      : "function";

  const rows = await getSummariesByLevel(id, levelFilter);

  const summaries: SummaryViewData[] = rows.map((r) => ({
    id: r.id,
    targetId: r.targetId,
    content: r.content,
    model: r.model,
  }));

  const userName = req.session.user?.name ?? "User";

  const data = {
    projectId: id,
    projectName: project.name,
    summaries,
    userName,
    levelFilter,
  };

  if (req.headers["hx-request"]) {
    res.send(summariesFragment(data));
    return;
  }

  res.send(summariesPage(data));
});
