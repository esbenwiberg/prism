/**
 * Blueprint splitter — group related findings and modules into subsystems.
 *
 * When a project has many findings across different areas, the splitter
 * groups them by subsystem so the blueprint generator can produce focused,
 * actionable proposals for each area.
 */

import type { FindingRow } from "@prism/core";
import type { SummaryRow } from "@prism/core";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A subsystem grouping of findings and module summaries. */
export interface SubsystemGroup {
  /** Name of the subsystem (derived from common path prefix). */
  name: string;
  /** Findings related to this subsystem. */
  findings: FindingRow[];
  /** Module summaries related to this subsystem. */
  moduleSummaries: SummaryRow[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Split findings and module summaries into subsystem groups.
 *
 * Groups findings by their evidence file paths, mapping them to the
 * closest matching module summary. Findings without file path evidence
 * are placed in a "general" group.
 *
 * @param findings        — All findings for the project.
 * @param moduleSummaries — All module-level summaries for the project.
 * @returns Array of subsystem groups, sorted by finding count (most first).
 */
export function splitBySubsystem(
  findings: FindingRow[],
  moduleSummaries: SummaryRow[],
): SubsystemGroup[] {
  // Build a set of module paths from summaries
  const modulePathSet = new Set<string>();
  for (const summary of moduleSummaries) {
    // targetId format: "module:path/to/module"
    const modulePath = summary.targetId.replace(/^module:/, "");
    modulePathSet.add(modulePath);
  }

  // Map each finding to a module path
  const groups = new Map<string, FindingRow[]>();

  for (const finding of findings) {
    const modulePath = findModulePath(finding, modulePathSet);
    const existing = groups.get(modulePath) ?? [];
    existing.push(finding);
    groups.set(modulePath, existing);
  }

  // Build subsystem groups with matching summaries
  const result: SubsystemGroup[] = [];

  for (const [modulePath, groupFindings] of groups) {
    const matchingSummaries = moduleSummaries.filter((s) => {
      const sPath = s.targetId.replace(/^module:/, "");
      return sPath === modulePath || sPath.startsWith(modulePath + "/");
    });

    result.push({
      name: modulePath || "general",
      findings: groupFindings,
      moduleSummaries: matchingSummaries,
    });
  }

  // Sort by finding count descending
  result.sort((a, b) => b.findings.length - a.findings.length);

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the best-matching module path from a finding's evidence.
 */
function findModulePath(
  finding: FindingRow,
  modulePathSet: Set<string>,
): string {
  // Try to extract a file path from evidence
  const evidence = finding.evidence as Record<string, unknown> | null;
  let filePath: string | null = null;

  if (evidence) {
    if (typeof evidence.filePath === "string") {
      filePath = evidence.filePath;
    } else if (typeof evidence.sourceFilePath === "string") {
      filePath = evidence.sourceFilePath;
    } else if (
      Array.isArray(evidence.filePaths) &&
      typeof evidence.filePaths[0] === "string"
    ) {
      filePath = evidence.filePaths[0];
    }
  }

  if (!filePath) return "general";

  // Walk up the directory tree to find the closest matching module
  const parts = filePath.split("/");
  for (let i = parts.length - 1; i > 0; i--) {
    const dirPath = parts.slice(0, i).join("/");
    if (modulePathSet.has(dirPath)) {
      return dirPath;
    }
  }

  // Use the first directory as fallback
  return parts.length > 1 ? parts[0] : "general";
}
