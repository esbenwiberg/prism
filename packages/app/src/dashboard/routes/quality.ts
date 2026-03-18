/**
 * Quality route — GET /projects/:id/quality
 *
 * Surfaces quality metrics for AI-generated summaries: score distribution,
 * averages by level, demoted entries, and low-quality flagged items.
 */

import { Router } from "express";
import { eq, and, lt, sql } from "drizzle-orm";
import { getProject, getDb, summaries } from "@prism/core";
import {
  qualityPage,
  qualityFragment,
  type QualityBucket,
  type QualityByLevel,
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

  const db = getDb();

  // ---- Total summaries + average score ----
  const [statsRow] = await db
    .select({
      total: sql<number>`count(*)::int`,
      avg: sql<number>`avg(${summaries.qualityScore})`,
      demoted: sql<number>`count(*) filter (where ${summaries.demoted} = true)::int`,
    })
    .from(summaries)
    .where(eq(summaries.projectId, id));

  const totalSummaries = statsRow?.total ?? 0;
  const averageScore = statsRow?.avg !== null && statsRow?.avg !== undefined
    ? Number(statsRow.avg)
    : null;
  const demotedCount = statsRow?.demoted ?? 0;

  // ---- Score distribution buckets ----
  const bucketRows = await db
    .select({
      bucket: sql<string>`
        case
          when ${summaries.qualityScore} is null then 'unscored'
          when ${summaries.qualityScore} < 0.2 then '0-0.2'
          when ${summaries.qualityScore} < 0.4 then '0.2-0.4'
          when ${summaries.qualityScore} < 0.6 then '0.4-0.6'
          when ${summaries.qualityScore} < 0.8 then '0.6-0.8'
          else '0.8-1.0'
        end`,
      count: sql<number>`count(*)::int`,
    })
    .from(summaries)
    .where(eq(summaries.projectId, id))
    .groupBy(sql`1`);

  const bucketMap = new Map(bucketRows.map((r) => [r.bucket, r.count]));
  const distribution: QualityBucket[] = [
    { label: "0-0.2", count: bucketMap.get("0-0.2") ?? 0 },
    { label: "0.2-0.4", count: bucketMap.get("0.2-0.4") ?? 0 },
    { label: "0.4-0.6", count: bucketMap.get("0.4-0.6") ?? 0 },
    { label: "0.6-0.8", count: bucketMap.get("0.6-0.8") ?? 0 },
    { label: "0.8-1.0", count: bucketMap.get("0.8-1.0") ?? 0 },
  ];

  // ---- Average quality by level ----
  const byLevelRows = await db
    .select({
      level: summaries.level,
      avgScore: sql<number>`avg(${summaries.qualityScore})`,
      count: sql<number>`count(*)::int`,
    })
    .from(summaries)
    .where(eq(summaries.projectId, id))
    .groupBy(summaries.level);

  const byLevel: QualityByLevel[] = byLevelRows.map((r) => ({
    level: r.level,
    avgScore: r.avgScore !== null ? Number(r.avgScore) : 0,
    count: r.count,
  }));

  // ---- Demoted summaries ----
  const demotedRows = await db
    .select({
      id: summaries.id,
      targetId: summaries.targetId,
      level: summaries.level,
      content: summaries.content,
      qualityScore: summaries.qualityScore,
      demoted: summaries.demoted,
    })
    .from(summaries)
    .where(and(eq(summaries.projectId, id), eq(summaries.demoted, true)));

  const demotedSummaries: QualitySummaryRow[] = demotedRows.map((r) => ({
    id: r.id,
    targetId: r.targetId,
    level: r.level,
    content: r.content,
    qualityScore: r.qualityScore !== null ? Number(r.qualityScore) : null,
    demoted: r.demoted,
  }));

  // ---- Low quality (score < 0.4) ----
  const lowQualityRows = await db
    .select({
      id: summaries.id,
      targetId: summaries.targetId,
      level: summaries.level,
      content: summaries.content,
      qualityScore: summaries.qualityScore,
      demoted: summaries.demoted,
    })
    .from(summaries)
    .where(
      and(
        eq(summaries.projectId, id),
        lt(summaries.qualityScore, "0.4"),
      ),
    )
    .orderBy(summaries.qualityScore);

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
    totalSummaries,
    averageScore,
    demotedCount,
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
