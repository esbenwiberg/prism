/**
 * Quality dashboard view — surfaces quality metrics for summaries.
 */

import { layout } from "./layout.js";
import {
  escapeHtml,
  badge,
  card,
  statCard,
  table,
  projectTabNav,
  emptyState,
  type BadgeVariant,
  type TableColumn,
} from "./components.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface QualityBucket {
  label: string;
  count: number;
}

export interface QualityByLevel {
  level: string;
  avgScore: number;
  count: number;
}

export interface QualitySummaryRow {
  id: number;
  targetId: string;
  level: string;
  content: string;
  qualityScore: number | null;
  demoted: boolean;
}

export interface QualityPageData {
  projectId: number;
  projectName: string;
  userName: string;
  totalSummaries: number;
  averageScore: number | null;
  demotedCount: number;
  distribution: QualityBucket[];
  byLevel: QualityByLevel[];
  demotedSummaries: QualitySummaryRow[];
  lowQualitySummaries: QualitySummaryRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreBadge(score: number | null): string {
  if (score === null) return badge("N/A", "neutral");
  if (score >= 0.8) return badge(score.toFixed(2), "success");
  if (score >= 0.6) return badge(score.toFixed(2), "info");
  if (score >= 0.4) return badge(score.toFixed(2), "warning");
  return badge(score.toFixed(2), "danger");
}

function levelBadge(level: string): string {
  const map: Record<string, BadgeVariant> = {
    function: "info",
    file: "neutral",
    module: "warning",
    system: "success",
  };
  return badge(level, map[level] ?? "neutral");
}

function contentPreview(content: string, maxLen = 100): string {
  const text = content.length > maxLen ? content.slice(0, maxLen) + "..." : content;
  return `<span class="text-slate-400 text-xs">${escapeHtml(text)}</span>`;
}

// ---------------------------------------------------------------------------
// Distribution bar chart (CSS-only)
// ---------------------------------------------------------------------------

function distributionChart(buckets: QualityBucket[]): string {
  const maxCount = Math.max(...buckets.map((b) => b.count), 1);

  const bars = buckets
    .map((b) => {
      const pct = Math.round((b.count / maxCount) * 100);
      const colors: Record<string, string> = {
        "0-0.2": "bg-red-500",
        "0.2-0.4": "bg-amber-500",
        "0.4-0.6": "bg-yellow-400",
        "0.6-0.8": "bg-blue-400",
        "0.8-1.0": "bg-emerald-400",
      };
      const color = colors[b.label] ?? "bg-slate-500";
      return `<div class="flex items-end gap-1 flex-1">
        <div class="w-full flex flex-col items-center">
          <span class="text-xs text-slate-400 mb-1">${b.count}</span>
          <div class="${color} rounded-t w-full transition-all" style="height: ${Math.max(pct, 4)}px;"></div>
          <span class="text-xs text-slate-500 mt-1">${escapeHtml(b.label)}</span>
        </div>
      </div>`;
    })
    .join("");

  return `<div class="flex items-end gap-3 h-32 px-2">${bars}</div>`;
}

// ---------------------------------------------------------------------------
// Summary table columns
// ---------------------------------------------------------------------------

function summaryColumns(): TableColumn<QualitySummaryRow>[] {
  return [
    {
      header: "Target",
      render: (r) => `<span class="font-medium text-slate-200 text-xs font-mono">${escapeHtml(r.targetId)}</span>`,
    },
    {
      header: "Level",
      render: (r) => levelBadge(r.level),
      align: "center",
    },
    {
      header: "Score",
      render: (r) => scoreBadge(r.qualityScore),
      align: "center",
    },
    {
      header: "Demoted",
      render: (r) => (r.demoted ? badge("yes", "danger") : badge("no", "neutral")),
      align: "center",
    },
    {
      header: "Content",
      render: (r) => contentPreview(r.content),
    },
  ];
}

// ---------------------------------------------------------------------------
// By-level table
// ---------------------------------------------------------------------------

function byLevelTable(rows: QualityByLevel[]): string {
  const cols: TableColumn<QualityByLevel>[] = [
    {
      header: "Level",
      render: (r) => levelBadge(r.level),
    },
    {
      header: "Summaries",
      render: (r) => `<span class="text-slate-300">${r.count}</span>`,
      align: "center",
    },
    {
      header: "Avg Score",
      render: (r) => scoreBadge(r.avgScore),
      align: "center",
    },
  ];
  return table(cols, rows);
}

// ---------------------------------------------------------------------------
// Content builder (shared by page + fragment)
// ---------------------------------------------------------------------------

function qualityContent(data: QualityPageData): string {
  const {
    projectId,
    projectName,
    totalSummaries,
    averageScore,
    demotedCount,
    distribution,
    byLevel,
    demotedSummaries,
    lowQualitySummaries,
  } = data;

  if (totalSummaries === 0) {
    return (
      projectTabNav(projectId, projectName, "quality") +
      emptyState("No summaries found. Run the semantic pipeline to generate summaries.")
    );
  }

  const statsRow = `<div class="flex gap-4 flex-wrap mb-6">
    ${statCard("Total Summaries", totalSummaries)}
    ${statCard("Average Score", averageScore !== null ? averageScore.toFixed(2) : "N/A", { color: "purple" })}
    ${statCard("Demoted", demotedCount, { color: demotedCount > 0 ? "red" : "emerald" })}
  </div>`;

  const distCard = card("Score Distribution", distributionChart(distribution));

  const levelCard = card("Average Quality by Level", byLevelTable(byLevel));

  const demotedSection =
    demotedSummaries.length > 0
      ? card(
          `Demoted Summaries (${demotedSummaries.length})`,
          table(summaryColumns(), demotedSummaries),
        )
      : "";

  const lowQualitySection =
    lowQualitySummaries.length > 0
      ? card(
          `Low Quality (score < 0.4) — ${lowQualitySummaries.length}`,
          table(summaryColumns(), lowQualitySummaries),
        )
      : "";

  return (
    projectTabNav(projectId, projectName, "quality") +
    `<h2 class="text-xl font-semibold text-slate-50 mb-4">Quality Dashboard</h2>` +
    statsRow +
    `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">${distCard}${levelCard}</div>` +
    demotedSection +
    lowQualitySection
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function qualityPage(data: QualityPageData): string {
  return layout({
    title: `${data.projectName} — Quality`,
    content: qualityContent(data),
    userName: data.userName,
    activeNav: `project-${data.projectId}`,
  });
}

export function qualityFragment(data: QualityPageData): string {
  return qualityContent(data);
}
