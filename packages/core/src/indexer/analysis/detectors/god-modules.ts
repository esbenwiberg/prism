/**
 * God-module detector.
 *
 * Identifies modules (files) with excessively high fan-in AND fan-out,
 * indicating they do too much and are coupled to too many other parts
 * of the system.
 */

import type { DetectorFinding } from "./circular-deps.js";
import type { FindingSeverity } from "../../../domain/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** File metrics needed for god-module detection. */
export interface FileMetricsInput {
  fileId: number;
  filePath: string;
  /** Number of files this file imports (efferent coupling / fan-out). */
  fanOut: number;
  /** Number of files that import this file (afferent coupling / fan-in). */
  fanIn: number;
  /** Number of symbols exported by this file. */
  symbolCount: number;
  /** Total lines of code. */
  lineCount: number;
}

/** Thresholds for god-module detection. */
export interface GodModuleThresholds {
  /** Minimum fan-in to be considered (default: 8). */
  minFanIn: number;
  /** Minimum fan-out to be considered (default: 8). */
  minFanOut: number;
  /** Minimum combined fan-in + fan-out (default: 20). */
  minCombined: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLDS: GodModuleThresholds = {
  minFanIn: 8,
  minFanOut: 8,
  minCombined: 20,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect god modules — files with excessively high fan-in AND fan-out.
 *
 * A god module is a file that is imported by many other files (high fan-in)
 * AND imports many other files itself (high fan-out). This indicates it has
 * too many responsibilities.
 *
 * @param filesMetrics — Metrics for all files in the project.
 * @param thresholds   — Detection thresholds (optional, uses defaults).
 * @returns Findings for each detected god module.
 */
export function detectGodModules(
  filesMetrics: FileMetricsInput[],
  thresholds: Partial<GodModuleThresholds> = {},
): DetectorFinding[] {
  const t: GodModuleThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const findings: DetectorFinding[] = [];

  for (const file of filesMetrics) {
    const combined = file.fanIn + file.fanOut;

    if (
      file.fanIn >= t.minFanIn &&
      file.fanOut >= t.minFanOut &&
      combined >= t.minCombined
    ) {
      const severity: FindingSeverity =
        combined > 40 ? "high" : combined > 30 ? "medium" : "low";

      findings.push({
        category: "god-module",
        severity,
        title: `God module: ${file.filePath}`,
        description:
          `File ${file.filePath} has ${file.fanIn} incoming and ${file.fanOut} outgoing ` +
          `dependencies (combined: ${combined}), with ${file.symbolCount} symbols ` +
          `across ${file.lineCount} lines. This suggests the file has too many responsibilities.`,
        evidence: {
          fileId: file.fileId,
          filePath: file.filePath,
          fanIn: file.fanIn,
          fanOut: file.fanOut,
          combined,
          symbolCount: file.symbolCount,
          lineCount: file.lineCount,
        },
        suggestion:
          "Split this file into smaller, focused modules. Extract related " +
          "functionality into separate files with clear single responsibilities. " +
          "Consider introducing a facade if many consumers depend on this module.",
      });
    }
  }

  return findings;
}
