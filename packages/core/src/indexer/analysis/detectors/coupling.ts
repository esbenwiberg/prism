/**
 * Coupling/cohesion threshold detector.
 *
 * Flags files that exceed acceptable coupling thresholds or have
 * poor cohesion scores, indicating potential architectural issues.
 */

import type { DetectorFinding } from "./circular-deps.js";
import type { FindingSeverity } from "../../../domain/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** File metrics for coupling/cohesion analysis. */
export interface CouplingMetricsInput {
  fileId: number;
  filePath: string;
  /** Efferent coupling: number of files this file depends on. */
  efferentCoupling: number;
  /** Afferent coupling: number of files that depend on this file. */
  afferentCoupling: number;
  /** Cohesion score (0-1, higher is better). */
  cohesion: number;
  /** Total coupling (efferent + afferent). */
  totalCoupling: number;
}

/** Thresholds for coupling/cohesion detection. */
export interface CouplingThresholds {
  /** Maximum efferent coupling before warning (default: 15). */
  maxEfferentCoupling: number;
  /** Maximum afferent coupling before warning (default: 20). */
  maxAfferentCoupling: number;
  /** Minimum cohesion score (default: 0.2). */
  minCohesion: number;
  /** Maximum total coupling before warning (default: 25). */
  maxTotalCoupling: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_THRESHOLDS: CouplingThresholds = {
  maxEfferentCoupling: 15,
  maxAfferentCoupling: 20,
  minCohesion: 0.2,
  maxTotalCoupling: 25,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect files with excessive coupling or poor cohesion.
 *
 * @param filesMetrics — Coupling/cohesion metrics for all files.
 * @param thresholds   — Detection thresholds (optional, uses defaults).
 * @returns Findings for files exceeding thresholds.
 */
export function detectCouplingIssues(
  filesMetrics: CouplingMetricsInput[],
  thresholds: Partial<CouplingThresholds> = {},
): DetectorFinding[] {
  const t: CouplingThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const findings: DetectorFinding[] = [];

  for (const file of filesMetrics) {
    // High efferent coupling (depends on too many files)
    if (file.efferentCoupling > t.maxEfferentCoupling) {
      const severity: FindingSeverity =
        file.efferentCoupling > t.maxEfferentCoupling * 2 ? "high" : "medium";

      findings.push({
        category: "coupling",
        severity,
        title: `High efferent coupling: ${file.filePath}`,
        description:
          `File ${file.filePath} depends on ${file.efferentCoupling} other files ` +
          `(threshold: ${t.maxEfferentCoupling}). This makes the file fragile — ` +
          `changes in any dependency may require changes here.`,
        evidence: {
          fileId: file.fileId,
          filePath: file.filePath,
          efferentCoupling: file.efferentCoupling,
          threshold: t.maxEfferentCoupling,
        },
        suggestion:
          "Reduce the number of direct dependencies by introducing intermediary " +
          "abstractions or by splitting this file into smaller, focused modules.",
      });
    }

    // High afferent coupling (too many dependents)
    if (file.afferentCoupling > t.maxAfferentCoupling) {
      const severity: FindingSeverity =
        file.afferentCoupling > t.maxAfferentCoupling * 2 ? "high" : "medium";

      findings.push({
        category: "coupling",
        severity,
        title: `High afferent coupling: ${file.filePath}`,
        description:
          `File ${file.filePath} is depended upon by ${file.afferentCoupling} other files ` +
          `(threshold: ${t.maxAfferentCoupling}). Changes to this file have a wide blast radius.`,
        evidence: {
          fileId: file.fileId,
          filePath: file.filePath,
          afferentCoupling: file.afferentCoupling,
          threshold: t.maxAfferentCoupling,
        },
        suggestion:
          "Stabilise this file's API to reduce risk. Consider splitting it " +
          "into smaller modules with narrower interfaces, or introduce a " +
          "versioning strategy for breaking changes.",
      });
    }

    // Poor cohesion
    if (file.cohesion < t.minCohesion && file.cohesion >= 0) {
      findings.push({
        category: "coupling",
        severity: "low",
        title: `Low cohesion: ${file.filePath}`,
        description:
          `File ${file.filePath} has a cohesion score of ${file.cohesion.toFixed(2)} ` +
          `(minimum threshold: ${t.minCohesion}). The symbols in this file have ` +
          `few internal references, suggesting unrelated responsibilities.`,
        evidence: {
          fileId: file.fileId,
          filePath: file.filePath,
          cohesion: file.cohesion,
          threshold: t.minCohesion,
        },
        suggestion:
          "Group related functionality together. Move unrelated symbols to " +
          "more appropriate files to improve cohesion.",
      });
    }

    // Excessive total coupling
    if (file.totalCoupling > t.maxTotalCoupling) {
      const severity: FindingSeverity =
        file.totalCoupling > t.maxTotalCoupling * 2 ? "high" : "medium";

      findings.push({
        category: "coupling",
        severity,
        title: `Excessive total coupling: ${file.filePath}`,
        description:
          `File ${file.filePath} has a total coupling score of ${file.totalCoupling} ` +
          `(${file.efferentCoupling} outgoing + ${file.afferentCoupling} incoming, ` +
          `threshold: ${t.maxTotalCoupling}). This file is a coupling hotspot.`,
        evidence: {
          fileId: file.fileId,
          filePath: file.filePath,
          totalCoupling: file.totalCoupling,
          efferentCoupling: file.efferentCoupling,
          afferentCoupling: file.afferentCoupling,
          threshold: t.maxTotalCoupling,
        },
        suggestion:
          "Reduce coupling by introducing a facade or mediator pattern. " +
          "Consider whether this file is trying to be a hub that should " +
          "instead be split into domain-specific modules.",
      });
    }
  }

  return findings;
}
