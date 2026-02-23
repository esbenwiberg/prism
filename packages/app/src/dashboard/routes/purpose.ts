/**
 * Purpose route — GET /projects/:id/purpose
 *
 * Displays the structured purpose document for a project (Layer 2.5).
 */

import { Router } from "express";
import { getProject, getSummariesByLevel } from "@prism/core";
import { purposePage, purposeFragment } from "../views/index.js";

export const purposeRouter = Router();

purposeRouter.get("/projects/:id/purpose", async (req, res) => {
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

  const rows = await getSummariesByLevel(id, "purpose");
  // There should be at most one purpose document
  const content = rows[0]?.content ?? null;

  const userName = req.session.user?.name ?? "User";

  const data = {
    projectId: id,
    projectName: project.name,
    content,
    userName,
  };

  if (req.headers["hx-request"]) {
    res.send(purposeFragment(data));
    return;
  }

  res.send(purposePage(data));
});
