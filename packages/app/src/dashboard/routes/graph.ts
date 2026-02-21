/**
 * Dependency graph routes.
 *
 * GET /projects/:id/graph        — render the graph page
 * GET /api/projects/:id/graph    — return graph data as JSON (for D3)
 */

import { Router } from "express";
import {
  getProject,
  getProjectFiles,
  getDependenciesByProjectId,
} from "@prism/core";
import { graphPage, graphFragment } from "../views/graph.js";

export const graphRouter = Router();

/**
 * Graph page — renders the D3 visualization page.
 */
graphRouter.get("/projects/:id/graph", async (req, res) => {
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
    res.send(graphFragment(data));
    return;
  }

  res.send(graphPage(data));
});

/**
 * Graph API — returns the graph data as JSON for D3.
 *
 * Response shape:
 * {
 *   nodes: [{ id, path, module, complexity, lineCount }],
 *   edges: [{ source, target }]
 * }
 */
graphRouter.get("/api/projects/:id/graph", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }

  const project = await getProject(id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [files, deps] = await Promise.all([
    getProjectFiles(id),
    getDependenciesByProjectId(id),
  ]);

  // Build node list — only include source code files (not docs/configs)
  const sourceFiles = files.filter((f) => !f.isDoc && !f.isConfig);
  const fileIdSet = new Set(sourceFiles.map((f) => f.id));

  const nodes = sourceFiles.map((f) => {
    // Extract module from path (first directory segment)
    const parts = f.path.split("/");
    const module = parts.length > 1 ? parts[0] : "root";

    return {
      id: f.id,
      path: f.path,
      module,
      complexity: f.complexity ? Number(f.complexity) : 0,
      lineCount: f.lineCount ?? 0,
    };
  });

  // Build edge list — only include edges between files in our set
  const edges = deps
    .filter(
      (d) =>
        d.targetFileId != null &&
        fileIdSet.has(d.sourceFileId) &&
        fileIdSet.has(d.targetFileId),
    )
    .map((d) => ({
      source: d.sourceFileId,
      target: d.targetFileId!,
    }));

  // Deduplicate edges
  const edgeSet = new Set<string>();
  const uniqueEdges = edges.filter((e) => {
    const key = `${e.source}-${e.target}`;
    if (edgeSet.has(key)) return false;
    edgeSet.add(key);
    return true;
  });

  res.json({ nodes, edges: uniqueEdges });
});
