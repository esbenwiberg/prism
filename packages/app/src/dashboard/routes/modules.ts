/**
 * Modules route — GET /projects/:id/modules
 *
 * Shows module-level overview with summaries and metrics.
 */

import { dirname } from "node:path";
import { Router } from "express";
import {
  getProject,
  getProjectFiles,
  getSummariesByLevel,
} from "@prism/core";
import {
  modulesPage,
  modulesFragment,
  type ModuleViewData,
} from "../views/modules.js";

export const modulesRouter = Router();

modulesRouter.get("/projects/:id/modules", async (req, res) => {
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

  const [files, moduleSummaries] = await Promise.all([
    getProjectFiles(id),
    getSummariesByLevel(id, "module"),
  ]);

  // Group files by module (directory)
  const moduleFiles = new Map<string, typeof files>();
  for (const f of files) {
    const modulePath = dirname(f.path);
    if (modulePath === ".") continue;

    const existing = moduleFiles.get(modulePath) ?? [];
    existing.push(f);
    moduleFiles.set(modulePath, existing);
  }

  // Build module summary lookup
  const summaryMap = new Map<string, string>();
  for (const s of moduleSummaries) {
    const modulePath = s.targetId.replace(/^module:/, "");
    summaryMap.set(modulePath, s.content);
  }

  // Build module view data
  const modules: ModuleViewData[] = [];
  for (const [modulePath, mFiles] of moduleFiles) {
    const totalLines = mFiles.reduce((sum, f) => sum + (f.lineCount ?? 0), 0);
    const complexities = mFiles
      .map((f) => (f.complexity ? Number(f.complexity) : 0))
      .filter((c) => c > 0);
    const avgComplexity =
      complexities.length > 0
        ? complexities.reduce((s, c) => s + c, 0) / complexities.length
        : 0;

    modules.push({
      name: modulePath,
      fileCount: mFiles.length,
      totalLines,
      avgComplexity,
      summary: summaryMap.get(modulePath) ?? null,
    });
  }

  // Sort by file count descending
  modules.sort((a, b) => b.fileCount - a.fileCount);

  const userName = req.session.user?.name ?? "User";

  const data = {
    projectId: id,
    projectName: project.name,
    modules,
    userName,
  };

  if (req.headers["hx-request"]) {
    res.send(modulesFragment(data));
    return;
  }

  res.send(modulesPage(data));
});
