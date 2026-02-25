/**
 * Re-index runs page routes — /reindex-runs
 */

import { Router } from "express";
import { listReindexRequestsWithProjects, listRecentIndexJobs } from "@prism/core";
import { reindexRunsPage, reindexActiveFragment } from "../views/reindex-runs.js";

export const reindexRunsRouter = Router();

async function fetchData() {
  const [queue, allJobs] = await Promise.all([
    listReindexRequestsWithProjects(),
    listRecentIndexJobs(100),
  ]);
  const activeJobs = allJobs.filter(
    (j) => j.status === "running" || j.status === "pending",
  );
  const historyJobs = allJobs.filter(
    (j) => j.status !== "running" && j.status !== "pending",
  );
  return { queue, activeJobs, historyJobs };
}

reindexRunsRouter.get("/reindex-runs", async (req, res) => {
  const userName = req.session.user?.name ?? "User";
  const data = await fetchData();

  if (req.headers["hx-request"]) {
    res.send(
      `<div class="space-y-8">
        ${reindexActiveFragment(data.queue, data.activeJobs)}
      </div>`,
    );
    return;
  }

  res.send(reindexRunsPage(data, userName));
});

/** Partial endpoint for HTMX polling — returns just the active section. */
reindexRunsRouter.get("/reindex-runs/active", async (req, res) => {
  const data = await fetchData();
  res.send(reindexActiveFragment(data.queue, data.activeJobs));
});
