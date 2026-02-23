/**
 * Symbols route — GET /projects/:id/symbols
 *
 * Lists symbols for a project with optional kind filter.
 */

import { Router } from "express";
import {
  getProject,
  getProjectFiles,
  getSymbolsByProjectId,
  type FileRow,
} from "@prism/core";
import {
  symbolsPage,
  symbolsFragment,
  type SymbolViewData,
} from "../views/index.js";

export const symbolsRouter = Router();

const VALID_KINDS = new Set([
  "function",
  "class",
  "interface",
  "type",
  "method",
  "variable",
  "enum",
  "export",
  "import",
]);

symbolsRouter.get("/projects/:id/symbols", async (req, res) => {
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

  const kindFilter =
    typeof req.query.kind === "string" ? req.query.kind : "";

  const [rawSymbols, files] = await Promise.all([
    getSymbolsByProjectId(id),
    getProjectFiles(id),
  ]);

  // Build fileId → path lookup
  const filePathMap = new Map<number, string>(
    files.map((f: FileRow) => [f.id, f.path]),
  );

  let filtered = rawSymbols;
  if (kindFilter && VALID_KINDS.has(kindFilter)) {
    filtered = rawSymbols.filter((s) => s.kind === kindFilter);
  }

  const symbols: SymbolViewData[] = filtered.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    filePath: filePathMap.get(s.fileId) ?? String(s.fileId),
    exported: s.exported,
    complexity: s.complexity,
  }));

  const userName = req.session.user?.name ?? "User";

  const data = {
    projectId: id,
    projectName: project.name,
    symbols,
    userName,
    kindFilter,
  };

  if (req.headers["hx-request"]) {
    res.send(symbolsFragment(data));
    return;
  }

  res.send(symbolsPage(data));
});
