/**
 * Findings signal collector.
 *
 * Filters findings by file or module scope using evidence JSONB text matching.
 */

import {
  getFindingsByProjectId,
  getFindingsByProjectIdAndSeverity,
  type FindingRow,
} from "../../db/queries/findings.js";
import type { SignalResult } from "../types.js";

function severityEmoji(severity: string): string {
  switch (severity) {
    case "critical": return "🔴";
    case "high": return "⚠";
    case "medium": return "🟡";
    case "low": return "🔵";
    default: return "ℹ";
  }
}

function formatFinding(f: FindingRow): string {
  const lines = [
    `${severityEmoji(f.severity)} **${f.severity.toUpperCase()}:** ${f.title}`,
  ];
  if (f.description) lines.push(f.description);
  if (f.suggestion) lines.push(`*Fix:* ${f.suggestion}`);
  return lines.join("\n");
}

/**
 * Get findings scoped to a file path.
 * Matches findings whose evidence JSONB contains the file path.
 */
export async function collectFindingsByFilePath(
  projectId: number,
  filePath: string,
): Promise<SignalResult> {
  const allFindings = await getFindingsByProjectId(projectId);
  const scoped = allFindings.filter((f) => findingMatchesPath(f, filePath));

  return {
    heading: "Findings",
    priority: 5,
    items: scoped.map((f) => ({
      content: formatFinding(f),
      relevance: severityToRelevance(f.severity),
    })),
  };
}

/**
 * Get findings scoped to a module (directory prefix).
 */
export async function collectFindingsByModulePath(
  projectId: number,
  modulePath: string,
): Promise<SignalResult> {
  const allFindings = await getFindingsByProjectId(projectId);
  const prefix = modulePath.endsWith("/") ? modulePath : `${modulePath}/`;
  const scoped = allFindings.filter(
    (f) => findingMatchesPath(f, modulePath) || findingMatchesPath(f, prefix),
  );

  return {
    heading: "Findings",
    priority: 5,
    items: scoped.map((f) => ({
      content: formatFinding(f),
      relevance: severityToRelevance(f.severity),
    })),
  };
}

/**
 * Get critical/high findings for architecture overview.
 */
export async function collectCriticalFindings(
  projectId: number,
): Promise<SignalResult> {
  const [critical, high] = await Promise.all([
    getFindingsByProjectIdAndSeverity(projectId, "critical"),
    getFindingsByProjectIdAndSeverity(projectId, "high"),
  ]);

  const combined = [...critical, ...high];

  return {
    heading: "Critical Findings",
    priority: 3,
    items: combined.map((f) => ({
      content: formatFinding(f),
      relevance: severityToRelevance(f.severity),
    })),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findingMatchesPath(finding: FindingRow, path: string): boolean {
  if (!finding.evidence) return false;
  const evidenceStr =
    typeof finding.evidence === "string"
      ? finding.evidence
      : JSON.stringify(finding.evidence);
  return evidenceStr.includes(path);
}

function severityToRelevance(severity: string): number {
  switch (severity) {
    case "critical": return 1.0;
    case "high": return 0.85;
    case "medium": return 0.6;
    case "low": return 0.4;
    default: return 0.2;
  }
}
