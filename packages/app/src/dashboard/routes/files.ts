/**
 * Files route — GET /projects/:id/files
 *
 * Shows the file browser with metrics for a project.
 */

import { Router } from "express";
import { getProject, getProjectFiles } from "@prism/core";
import {
  filesPage,
  filesFragment,
  type FileViewData,
} from "../views/index.js";

export const filesRouter = Router();

filesRouter.get("/projects/:id/files", async (req, res) => {
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

  const rawFiles = await getProjectFiles(id);
  const files: FileViewData[] = rawFiles.map((f) => ({
    id: f.id,
    path: f.path,
    language: f.language,
    lineCount: f.lineCount,
    complexity: f.complexity,
    coupling: f.coupling,
    cohesion: f.cohesion,
    isDoc: f.isDoc,
    isTest: f.isTest,
    isConfig: f.isConfig,
  }));

  const userName = req.session.user?.name ?? "User";

  const data = {
    projectId: id,
    projectName: project.name,
    files,
    userName,
  };

  if (req.headers["hx-request"]) {
    res.send(filesFragment(data));
    return;
  }

  res.send(filesPage(data));
});
