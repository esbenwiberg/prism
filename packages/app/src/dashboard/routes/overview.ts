/**
 * Overview route — GET /
 *
 * Lists all registered projects.
 */

import { Router } from "express";
import { listProjects } from "@prism/core";
import { overviewPage, overviewFragment } from "../views/index.js";

export const overviewRouter = Router();

overviewRouter.get("/", async (req, res) => {
  const projects = await listProjects();
  const userName = req.session.user?.name ?? "User";

  // HTMX partial request — return only the content fragment
  if (req.headers["hx-request"]) {
    res.send(overviewFragment(projects));
    return;
  }

  res.send(overviewPage(projects, userName));
});
