/**
 * History route — GET /projects/:id/history
 *
 * Shows git history with commits, change hotspots, and co-change patterns.
 */

import { Router } from "express";
import {
  getProject,
  getRecentCommitsByProjectId,
  getChangeHotspots,
  getCoChangedFiles,
} from "@prism/core";
import {
  historyPage,
  historyFragment,
} from "../views/history.js";

export const historyRouter = Router();

historyRouter.get("/projects/:id/history", async (req, res) => {
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

  const commits = await getRecentCommitsByProjectId(id, 50);
  const hotspots = await getChangeHotspots(id, 20);

  // Get unique authors from commits
  const authors = new Set(commits.map((c) => c.authorName).filter(Boolean));

  // Check for fileId query param for co-changes
  const fileIdParam = req.query.fileId;
  let coChanges: Array<{ filePath: string; coChangeCount: number }> | undefined;
  let selectedFileId: number | undefined;
  let selectedFilePath: string | undefined;

  if (fileIdParam) {
    selectedFileId = parseInt(fileIdParam as string, 10);
    if (!isNaN(selectedFileId)) {
      coChanges = await getCoChangedFiles(id, selectedFileId, 15);
      // Find the file path from hotspots
      const hotspot = hotspots.find((h) => h.fileId === selectedFileId);
      selectedFilePath = hotspot?.filePath ?? `File #${selectedFileId}`;
    }
  }

  const commitData = commits.map((c) => ({
    sha: c.sha,
    authorName: c.authorName,
    committedAt: c.committedAt,
    message: c.message,
  }));

  const data = {
    projectId: id,
    projectName: project.name,
    commits: commitData,
    hotspots,
    coChanges,
    selectedFileId,
    selectedFilePath,
    totalAuthors: authors.size,
    userName: req.session.user?.name ?? "User",
  };

  if (req.headers["hx-request"]) {
    res.send(historyFragment(data));
    return;
  }

  res.send(historyPage(data));
});
