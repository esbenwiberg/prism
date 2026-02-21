/**
 * Project detail route — GET /projects/:id
 */

import { Router } from "express";
import { getProject, countFindingsByProjectId } from "@prism/core";
import { projectPage, projectFragment } from "../views/index.js";

export const projectRouter = Router();

projectRouter.get("/projects/:id", async (req, res) => {
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

  const findingsCount = await countFindingsByProjectId(id);
  const userName = req.session.user?.name ?? "User";

  const data = { project, findingsCount, userName };

  if (req.headers["hx-request"]) {
    res.send(projectFragment(data));
    return;
  }

  res.send(projectPage(data));
});
