/**
 * Project detail route — GET /projects/:id
 * Job routes — POST /projects/:id/index, POST /projects/:id/blueprint
 * Progress route — GET /projects/:id/progress
 */

import { Router } from "express";
import {
  getProject,
  countFindingsByProjectId,
  createJob,
  cancelJob,
  getJobsByProjectId,
  getIndexRunsByProjectId,
  logger,
} from "@prism/core";
import {
  projectPage,
  projectFragment,
  jobProgressFragment,
} from "../views/index.js";

export const projectRouter = Router();

// ---------------------------------------------------------------------------
// GET /projects/:id — project detail
// ---------------------------------------------------------------------------

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
  const jobs = await getJobsByProjectId(id);
  const indexRuns = await getIndexRunsByProjectId(id);

  // Latest job is the last one (jobs ordered by createdAt ascending)
  const latestJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;

  const data = { project, findingsCount, userName, latestJob, indexRuns };

  if (req.headers["hx-request"]) {
    res.send(projectFragment(data));
    return;
  }

  res.send(projectPage(data));
});

// ---------------------------------------------------------------------------
// POST /projects/:id/index — queue an indexing job
// ---------------------------------------------------------------------------

projectRouter.post("/projects/:id/index", async (req, res) => {
  try {
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

    const fullReindex = req.body?.fullReindex === "true";
    await createJob(id, "index", fullReindex ? { fullReindex: true } : null);

    logger.info({ projectId: id, fullReindex }, "Queued indexing job");

    // Return the updated progress fragment
    const jobs = await getJobsByProjectId(id);
    const indexRuns = await getIndexRunsByProjectId(id);
    const latestJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;

    res.send(
      jobProgressFragment({ projectId: id, latestJob, indexRuns }),
    );
  } catch (err) {
    logger.error({ err }, "Failed to queue indexing job");
    res.status(500).send("Failed to queue indexing job");
  }
});

// ---------------------------------------------------------------------------
// POST /projects/:id/blueprint — queue a blueprint generation job
// ---------------------------------------------------------------------------

projectRouter.post("/projects/:id/blueprint", async (req, res) => {
  try {
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

    const goal = (req.body?.goal as string)?.trim() || undefined;
    const focus = (req.body?.focus as string)?.trim() || undefined;

    const options = goal || focus ? { goal, focus } : null;
    await createJob(id, "blueprint", options);

    logger.info({ projectId: id, goal, focus }, "Queued blueprint job");

    // Return the updated progress fragment
    const jobs = await getJobsByProjectId(id);
    const indexRuns = await getIndexRunsByProjectId(id);
    const latestJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;

    res.send(
      jobProgressFragment({ projectId: id, latestJob, indexRuns }),
    );
  } catch (err) {
    logger.error({ err }, "Failed to queue blueprint job");
    res.status(500).send("Failed to queue blueprint job");
  }
});

// ---------------------------------------------------------------------------
// POST /projects/:id/run-layer — queue an index job for a single layer
// ---------------------------------------------------------------------------

projectRouter.post("/projects/:id/run-layer", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).send("Invalid project ID");
      return;
    }

    const layer = (req.body?.layer as string)?.trim();
    if (!layer) {
      res.status(400).send("layer is required");
      return;
    }

    const project = await getProject(id);
    if (!project) {
      res.status(404).send("Project not found");
      return;
    }

    await createJob(id, "index", { layers: [layer] });

    logger.info({ projectId: id, layer }, "Queued single-layer job");

    const jobs = await getJobsByProjectId(id);
    const indexRuns = await getIndexRunsByProjectId(id);
    const latestJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;

    res.send(
      jobProgressFragment({ projectId: id, latestJob, indexRuns }),
    );
  } catch (err) {
    logger.error({ err }, "Failed to queue layer job");
    res.status(500).send("Failed to queue layer job");
  }
});

// ---------------------------------------------------------------------------
// POST /projects/:id/cancel-job — cancel a running or pending job
// ---------------------------------------------------------------------------

projectRouter.post("/projects/:id/cancel-job", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).send("Invalid project ID");
      return;
    }

    const jobs = await getJobsByProjectId(id);
    // Find the latest active (pending or running) job
    const activeJob = [...jobs].reverse().find(
      (j) => j.status === "pending" || j.status === "running",
    );

    if (activeJob) {
      await cancelJob(activeJob.id);
      logger.info({ jobId: activeJob.id, projectId: id }, "Job cancelled by user");
    }

    // Return updated progress fragment
    const updatedJobs = await getJobsByProjectId(id);
    const indexRuns = await getIndexRunsByProjectId(id);
    const latestJob = updatedJobs.length > 0 ? updatedJobs[updatedJobs.length - 1] : null;

    res.send(
      jobProgressFragment({ projectId: id, latestJob, indexRuns }),
    );
  } catch (err) {
    logger.error({ err }, "Failed to cancel job");
    res.status(500).send("Failed to cancel job");
  }
});

// ---------------------------------------------------------------------------
// GET /projects/:id/progress — HTMX polling fragment for job status
// ---------------------------------------------------------------------------

projectRouter.get("/projects/:id/progress", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).send("Invalid project ID");
      return;
    }

    const jobs = await getJobsByProjectId(id);
    const indexRuns = await getIndexRunsByProjectId(id);
    const latestJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;

    res.send(
      jobProgressFragment({ projectId: id, latestJob, indexRuns }),
    );
  } catch (err) {
    logger.error({ err }, "Failed to fetch progress");
    res.status(500).send("Failed to fetch progress");
  }
});
