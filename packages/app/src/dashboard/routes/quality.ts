/**
 * Quality route — GET /projects/:id/quality
 *
 * Surfaces quality metrics for AI-generated summaries: score distribution,
 * averages by level, demoted entries, and low-quality flagged items.
 */

import { Router } from "express";
import {
  getProject,
  getQualityStats,
  getQualityDistribution,
  getQualityByLevel,
  getDemotedSummaries,
  getLowQualitySummaries,
} from "@prism/core";
import {
  qualityPage,
  qualityFragment,
  type QualityBucket,
  type QualityByLevel as QualityByLevelView,
  type QualitySummaryRow,
  type QualityPageData,
} from "../views/quality.js";

export const qualityRouter = Router();

qualityRouter.get("/projects/:id/quality", async (req, res) => {
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

  // ---- Aggregate stats ----
  const stats = await getQualityStats(id);

  // ---- Score distribution buckets ----
  const bucketRows = await getQualityDistribution(id);
  const bucketMap = new Map(bucketRows.map((r) => [r.bucket, r.count]));
  const distribution: QualityBucket[] = [
    { label: "0-0.2", count: bucketMap.get("0-0.2") ?? 0 },
    { label: "0.2-0.4", count: bucketMap.get("0.2-0.4") ?? 0 },
    { label: "0.4-0.6", count: bucketMap.get("0.4-0.6") ?? 0 },
    { label: "0.6-0.8", count: bucketMap.get("0.6-0.8") ?? 0 },
    { label: "0.8-1.0", count: bucketMap.get("0.8-1.0") ?? 0 },
  ];

  // ---- Average quality by level ----
  const byLevelRows = await getQualityByLevel(id);
  const byLevel: QualityByLevelView[] = byLevelRows.map((r) => ({
    level: r.level,
    avgScore: r.avgScore !== null ? Number(r.avgScore) : 0,
    count: r.count,
  }));

  // ---- Demoted summaries ----
  const demotedRows = await getDemotedSummaries(id);
  const demotedSummaries: QualitySummaryRow[] = demotedRows.map((r) => ({
    id: r.id,
    targetId: r.targetId,
    level: r.level,
    content: r.content,
    qualityScore: r.qualityScore !== null ? Number(r.qualityScore) : null,
    demoted: r.demoted,
  }));

  // ---- Low quality (score < 0.4) ----
  const lowQualityRows = await getLowQualitySummaries(id);
  const lowQualitySummaries: QualitySummaryRow[] = lowQualityRows.map((r) => ({
    id: r.id,
    targetId: r.targetId,
    level: r.level,
    content: r.content,
    qualityScore: r.qualityScore !== null ? Number(r.qualityScore) : null,
    demoted: r.demoted,
  }));

  const userName = req.session.user?.name ?? "User";

  const data: QualityPageData = {
    projectId: id,
    projectName: project.name,
    userName,
    totalSummaries: stats.total,
    averageScore: stats.avg,
    demotedCount: stats.demotedCount,
    distribution,
    byLevel,
    demotedSummaries,
    lowQualitySummaries,
  };

  if (req.headers["hx-request"]) {
    res.send(qualityFragment(data));
    return;
  }

  res.send(qualityPage(data));
});
