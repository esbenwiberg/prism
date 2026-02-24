/**
 * Overview route — GET /
 * Project creation routes — GET /projects/new, POST /projects
 *
 * Lists all registered projects and handles new project creation.
 */

import { Router } from "express";
import {
  listProjects,
  listCredentials,
  createProject,
  updateProject,
  isValidGitUrl,
  cloneDestination,
  logger,
} from "@prism/core";
import {
  overviewPage,
  overviewFragment,
  addProjectPage,
  addProjectFragment,
} from "../views/index.js";

export const overviewRouter = Router();

// ---------------------------------------------------------------------------
// GET / — project list
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// GET /projects/new — "Add Project" form
// ---------------------------------------------------------------------------

overviewRouter.get("/projects/new", async (req, res) => {
  try {
    const credentials = await listCredentials();
    const userName = req.session.user?.name ?? "User";

    if (req.headers["hx-request"]) {
      res.send(addProjectFragment({ credentials, userName }));
      return;
    }

    res.send(addProjectPage({ credentials, userName }));
  } catch (err) {
    logger.error({ err }, "Failed to load add-project form");
    res.status(500).send("Internal server error");
  }
});

// ---------------------------------------------------------------------------
// POST /projects — create a project from a git URL
// ---------------------------------------------------------------------------

overviewRouter.post("/projects", async (req, res) => {
  try {
    const { gitUrl, name, credentialId } = req.body as {
      gitUrl?: string;
      name?: string;
      credentialId?: string;
    };

    // Validate git URL
    if (!gitUrl || !isValidGitUrl(gitUrl.trim())) {
      const credentials = await listCredentials();
      const userName = req.session.user?.name ?? "User";
      const data = {
        credentials,
        userName,
        error: "Please provide a valid HTTPS git URL.",
      };

      if (req.headers["hx-request"]) {
        res.send(addProjectFragment(data));
        return;
      }
      res.send(addProjectPage(data));
      return;
    }

    // Derive project name from URL if not provided
    const trimmedUrl = gitUrl.trim();
    const derivedName =
      name?.trim() ||
      trimmedUrl.match(/\/([^/]+?)(?:\.git)?$/)?.[1] ||
      "unnamed-project";

    // Parse credential ID (empty string = no credential)
    const credId = credentialId ? parseInt(credentialId, 10) : undefined;

    // Create a placeholder path; will be set to the clone destination once we know the project ID.
    // Use a temp placeholder, then update with real clone destination.
    const tempPath = `/tmp/prism-clones/pending-${Date.now()}`;

    // Derive slug (owner/repo) from git URL
    // e.g. https://github.com/esbenwiberg/hive.git → esbenwiberg/hive
    const slugMatch = trimmedUrl.match(/[/:]([^/:]+\/[^/.]+?)(?:\.git)?$/);
    const slug = slugMatch?.[1] ?? undefined;

    const project = await createProject(derivedName, tempPath, {
      gitUrl: trimmedUrl,
      slug,
      credentialId: credId && !isNaN(credId) ? credId : undefined,
    });

    // Update path to the proper clone destination based on the project ID
    await updateProject(project.id, {
      path: cloneDestination(project.id),
    });

    // Redirect to the new project page
    if (req.headers["hx-request"]) {
      res.set("HX-Redirect", `/projects/${project.id}`);
      res.send("");
      return;
    }

    res.redirect(`/projects/${project.id}`);
  } catch (err) {
    logger.error({ err }, "Failed to create project");
    const credentials = await listCredentials();
    const userName = req.session.user?.name ?? "User";
    const data = {
      credentials,
      userName,
      error: "Failed to create project. Please try again.",
    };

    if (req.headers["hx-request"]) {
      res.send(addProjectFragment(data));
      return;
    }
    res.send(addProjectPage(data));
  }
});
