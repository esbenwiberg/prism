/**
 * Blueprints route — GET /projects/:id/blueprints
 *
 * Lists blueprint proposals for a project.
 */

import { Router } from "express";
import { getProject, getBlueprintsByProjectId } from "@prism/core";
import {
  blueprintsPage,
  blueprintsFragment,
  type BlueprintViewData,
} from "../views/blueprints.js";

export const blueprintsRouter = Router();

blueprintsRouter.get("/projects/:id/blueprints", async (req, res) => {
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

  const rawBlueprints = await getBlueprintsByProjectId(id);

  const blueprints: BlueprintViewData[] = rawBlueprints.map((bp) => ({
    id: bp.id,
    title: bp.title,
    subsystem: bp.subsystem,
    summary: bp.summary,
    proposedArchitecture: bp.proposedArchitecture,
    moduleChanges: bp.moduleChanges,
    migrationPath: bp.migrationPath,
    risks: bp.risks,
    rationale: bp.rationale,
    model: bp.model,
    costUsd: bp.costUsd,
  }));

  const userName = req.session.user?.name ?? "User";

  const data = {
    projectId: id,
    projectName: project.name,
    blueprints,
    userName,
  };

  if (req.headers["hx-request"]) {
    res.send(blueprintsFragment(data));
    return;
  }

  res.send(blueprintsPage(data));
});
