/**
 * Findings route — GET /projects/:id/findings
 *
 * Lists findings for a project, with optional severity filter.
 */

import { Router } from "express";
import {
  getProject,
  getFindingsByProjectId,
  getFindingsByProjectIdAndSeverity,
  type FindingSeverity,
} from "@prism/core";
import {
  findingsPage,
  findingsFragment,
  type FindingViewData,
} from "../views/index.js";

export const findingsRouter = Router();

const VALID_SEVERITIES = new Set<string>([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);

findingsRouter.get("/projects/:id/findings", async (req, res) => {
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

  const severityFilter = typeof req.query.severity === "string"
    ? req.query.severity
    : "";

  let rawFindings;
  if (severityFilter && VALID_SEVERITIES.has(severityFilter)) {
    rawFindings = await getFindingsByProjectIdAndSeverity(
      id,
      severityFilter as FindingSeverity,
    );
  } else {
    rawFindings = await getFindingsByProjectId(id);
  }

  const findings: FindingViewData[] = rawFindings.map((f) => ({
    id: f.id,
    category: f.category,
    severity: f.severity,
    title: f.title,
    description: f.description,
    suggestion: f.suggestion,
    createdAt: f.createdAt,
  }));

  const userName = req.session.user?.name ?? "User";

  const data = {
    projectId: id,
    projectName: project.name,
    findings,
    userName,
    severityFilter,
  };

  if (req.headers["hx-request"]) {
    res.send(findingsFragment(data));
    return;
  }

  res.send(findingsPage(data));
});
