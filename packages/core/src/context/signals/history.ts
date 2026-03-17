/**
 * History signal collector.
 *
 * Provides change context, hotspots, co-change patterns, and
 * drift review data from the git history tables.
 */

import {
  getRecentCommitsByProjectId,
  getRecentCommitsByFileId,
  getRecentCommitsByDateRange,
  getCommitFilesByCommitId,
  getCoChangedFiles,
  getChangeHotspots,
  getCommitsWithFileDetails,
  type CommitRow,
  type CommitWithFiles,
} from "../../db/queries/commits.js";
import { getFileByPath, type FileRow } from "../../db/queries/files.js";
import { getFindingsByProjectId } from "../../db/queries/findings.js";
import {
  getSummaryByTargetId,
  getSummariesByLevel,
} from "../../db/queries/summaries.js";
import type { SignalResult } from "../types.js";

// ---------------------------------------------------------------------------
// get_change_context signals
// ---------------------------------------------------------------------------

export interface ChangeContextOptions {
  projectId: number;
  filePath?: string;
  modulePath?: string;
  since?: Date;
  until?: Date;
  maxCommits?: number;
}

export async function collectChangeSignals(
  options: ChangeContextOptions,
): Promise<SignalResult[]> {
  const {
    projectId,
    filePath,
    modulePath,
    since,
    until,
    maxCommits = 20,
  } = options;

  const signals: SignalResult[] = [];

  // Get commits scoped by file, module, or project
  let commits: CommitRow[];
  if (filePath) {
    const file = await getFileByPath(projectId, filePath);
    if (file) {
      commits = await getRecentCommitsByFileId(file.id, maxCommits);

      // Co-change patterns for specific file
      const coChanged = await getCoChangedFiles(projectId, file.id, 8);
      if (coChanged.length > 0) {
        signals.push({
          heading: "Co-Change Patterns",
          priority: 3,
          items: coChanged.map((c) => ({
            content: `**${c.filePath}** — changed together ${c.coChangeCount} times`,
            relevance: Math.min(1, c.coChangeCount / 10),
          })),
        });
      }

      // Change frequency indicator
      if (file.changeFrequency && file.changeFrequency > 0) {
        const isHotspot = file.changeFrequency > 10;
        signals.push({
          heading: "Change Frequency",
          priority: 2,
          items: [
            {
              content: `Changed ${file.changeFrequency} times${isHotspot ? " (**hotspot** — consider refactoring)" : ""}`,
              relevance: isHotspot ? 0.9 : 0.5,
            },
          ],
        });
      }
    } else {
      commits = [];
    }
  } else if (since && until) {
    commits = await getRecentCommitsByDateRange(projectId, since, until);
  } else {
    commits = await getRecentCommitsByProjectId(projectId, maxCommits);
  }

  // Filter by module path if specified
  if (modulePath) {
    const prefix = modulePath.endsWith("/") ? modulePath : `${modulePath}/`;
    const filteredCommits: CommitRow[] = [];
    for (const c of commits) {
      const files = await getCommitFilesByCommitId(c.id);
      if (files.some((f) => f.filePath.startsWith(prefix))) {
        filteredCommits.push(c);
      }
    }
    commits = filteredCommits.slice(0, maxCommits);
  }

  // Recent commits signal
  if (commits.length > 0) {
    signals.unshift({
      heading: "Recent Commits",
      priority: 1,
      items: commits.map((c) => ({
        content: `\`${c.sha.slice(0, 7)}\` ${c.message}${c.authorName ? ` — ${c.authorName}` : ""}${c.committedAt ? ` (${c.committedAt.toISOString().slice(0, 10)})` : ""}`,
        relevance: 0.7,
      })),
    });

    // Author distribution
    const authorCounts = new Map<string, number>();
    for (const c of commits) {
      const name = c.authorName ?? "unknown";
      authorCounts.set(name, (authorCounts.get(name) ?? 0) + 1);
    }
    const authorItems = [...authorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        content: `${name}: ${count} commits`,
        relevance: 0.4,
      }));

    signals.push({
      heading: "Author Distribution",
      priority: 4,
      items: authorItems,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// get_review_context signals
// ---------------------------------------------------------------------------

export interface ReviewContextOptions {
  projectId: number;
  since: Date;
  until: Date;
}

export async function collectReviewSignals(
  options: ReviewContextOptions,
): Promise<SignalResult[]> {
  const { projectId, since, until } = options;
  const signals: SignalResult[] = [];

  // Get all commits with file details in the range
  const commitsWithFiles = await getCommitsWithFileDetails(
    projectId,
    since,
    until,
  );

  if (commitsWithFiles.length === 0) {
    signals.push({
      heading: "Change Summary",
      priority: 1,
      items: [
        {
          content: "No commits found in the specified date range.",
          relevance: 1.0,
        },
      ],
    });
    return signals;
  }

  // 1. Change summary
  const allChangedPaths = new Set<string>();
  const authorSet = new Map<string, number>();
  for (const c of commitsWithFiles) {
    for (const f of c.files) allChangedPaths.add(f.filePath);
    const name = c.authorName ?? "unknown";
    authorSet.set(name, (authorSet.get(name) ?? 0) + 1);
  }

  const topAuthors = [...authorSet.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n, c]) => `${n} (${c})`)
    .join(", ");

  signals.push({
    heading: "Change Summary",
    priority: 1,
    items: [
      {
        content: `**${commitsWithFiles.length} commits**, **${allChangedPaths.size} files changed**\nTop authors: ${topAuthors}\nPeriod: ${since.toISOString().slice(0, 10)} to ${until.toISOString().slice(0, 10)}`,
        relevance: 1.0,
      },
    ],
  });

  // 2. Changed files with context
  const changedFileItems = [];
  for (const path of [...allChangedPaths].slice(0, 30)) {
    const summary = await getSummaryByTargetId(projectId, `file:${path}`);
    const summaryText = summary
      ? summary.content.slice(0, 150)
      : "(no summary)";
    changedFileItems.push({
      content: `**${path}**\n${summaryText}`,
      relevance: 0.7,
    });
  }

  signals.push({
    heading: "Changed Files with Context",
    priority: 2,
    items: changedFileItems,
  });

  // 3. Hotspots in this period
  const hotspots = await getChangeHotspots(projectId, 10);
  const periodHotspots = hotspots.filter((h) => allChangedPaths.has(h.filePath));
  if (periodHotspots.length > 0) {
    signals.push({
      heading: "Hotspots",
      priority: 3,
      items: periodHotspots.map((h) => ({
        content: `**${h.filePath}** — ${h.changeCount} total changes (potential instability)`,
        relevance: Math.min(1, h.changeCount / 20),
      })),
    });
  }

  // 4. Findings referencing changed files (drift indicators)
  const allFindings = await getFindingsByProjectId(projectId);
  const driftFindings = allFindings.filter((f) => {
    const evidenceStr =
      typeof f.evidence === "string"
        ? f.evidence
        : JSON.stringify(f.evidence ?? "");
    return [...allChangedPaths].some((p) => evidenceStr.includes(p));
  });

  if (driftFindings.length > 0) {
    signals.push({
      heading: "Findings Affecting Changed Files",
      priority: 3,
      items: driftFindings.map((f) => ({
        content: `**${f.severity.toUpperCase()}:** ${f.title}\n${f.description ?? ""}`,
        relevance: f.severity === "critical" ? 1.0 : f.severity === "high" ? 0.85 : 0.6,
      })),
    });
  }

  // 5. Co-change clusters (files modified in same commits repeatedly)
  const coChangeMap = new Map<string, number>();
  for (const c of commitsWithFiles) {
    if (c.files.length >= 2 && c.files.length <= 10) {
      const key = c.files
        .map((f) => f.filePath)
        .sort()
        .join("|");
      coChangeMap.set(key, (coChangeMap.get(key) ?? 0) + 1);
    }
  }

  const clusters = [...coChangeMap.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (clusters.length > 0) {
    signals.push({
      heading: "Co-Change Clusters",
      priority: 4,
      items: clusters.map(([files, count]) => ({
        content: `Changed together ${count} times:\n${files.split("|").map((f) => `  - ${f}`).join("\n")}`,
        relevance: Math.min(1, count / 5),
      })),
    });
  }

  // 6. Architecture alignment — purpose + system summary as baseline
  const systemSummaries = await getSummariesByLevel(projectId, "system");
  const purposeSummary = systemSummaries.find((s) =>
    s.targetId.toLowerCase().includes("purpose"),
  );
  const systemSummary = systemSummaries.find(
    (s) => !s.targetId.toLowerCase().includes("purpose"),
  );

  const alignmentItems = [];
  if (purposeSummary) {
    alignmentItems.push({
      content: `**Purpose Document**\n${purposeSummary.content}`,
      relevance: 0.8,
    });
  }
  if (systemSummary) {
    alignmentItems.push({
      content: `**System Architecture**\n${systemSummary.content}`,
      relevance: 0.7,
    });
  }

  if (alignmentItems.length > 0) {
    signals.push({
      heading: "Architecture Alignment Baseline",
      priority: 5,
      items: alignmentItems,
    });
  }

  return signals;
}
