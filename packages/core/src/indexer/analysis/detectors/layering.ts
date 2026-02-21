/**
 * Layering violation detector.
 *
 * Detects "layers" from directory structure and flags cross-layer
 * import violations (e.g. a UI layer importing directly from DB layer).
 *
 * Layer ordering (higher number = higher level):
 *   db/data      (0) - Data access layer
 *   domain/model (1) - Domain/business logic
 *   service      (2) - Service layer
 *   api/routes   (3) - API / routing layer
 *   ui/views     (4) - Presentation layer
 *   cli          (4) - CLI layer (same level as UI)
 *
 * A violation occurs when a higher-layer file imports from a lower layer
 * that is more than 1 level below, OR when a lower layer imports from a
 * higher layer.
 */

import type { DetectorFinding } from "./circular-deps.js";
import type { FindingSeverity } from "../../../domain/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A dependency edge between two files. */
export interface LayeringEdge {
  sourceFileId: number;
  sourceFilePath: string;
  targetFileId: number;
  targetFilePath: string;
}

// ---------------------------------------------------------------------------
// Layer detection
// ---------------------------------------------------------------------------

/** Known layer patterns and their levels (lower = deeper). */
const LAYER_PATTERNS: Array<{ pattern: RegExp; level: number; name: string }> = [
  { pattern: /(?:^|\/)(?:db|data|database|dal|repository|repo)\//i, level: 0, name: "data" },
  { pattern: /(?:^|\/)(?:schema|migration|drizzle)\//i, level: 0, name: "data" },
  { pattern: /(?:^|\/)(?:domain|model|models|entities|types)\//i, level: 1, name: "domain" },
  { pattern: /(?:^|\/)(?:service|services|logic|core)\//i, level: 2, name: "service" },
  { pattern: /(?:^|\/)(?:indexer|engine|pipeline)\//i, level: 2, name: "service" },
  { pattern: /(?:^|\/)(?:api|routes?|controller|handler)\//i, level: 3, name: "api" },
  { pattern: /(?:^|\/)(?:ui|views?|components?|pages?|dashboard)\//i, level: 4, name: "presentation" },
  { pattern: /(?:^|\/)(?:cli|commands?)\//i, level: 4, name: "presentation" },
];

/**
 * Detect the layer of a file from its path.
 *
 * @returns The layer level and name, or null if the file doesn't match
 *          any known layer pattern.
 */
export function detectLayer(filePath: string): { level: number; name: string } | null {
  for (const { pattern, level, name } of LAYER_PATTERNS) {
    if (pattern.test(filePath)) {
      return { level, name };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect layering violations in the dependency graph.
 *
 * A violation occurs when:
 * 1. A lower-layer file imports from a higher-layer file (e.g. DB imports UI).
 * 2. A file skips layers (e.g. UI imports DB directly, skipping service).
 *
 * @param edges — Dependency edges with file paths.
 * @returns Findings for each layering violation detected.
 */
export function detectLayeringViolations(
  edges: LayeringEdge[],
): DetectorFinding[] {
  const findings: DetectorFinding[] = [];

  for (const edge of edges) {
    const sourceLayer = detectLayer(edge.sourceFilePath);
    const targetLayer = detectLayer(edge.targetFilePath);

    // Skip if either file doesn't have a detectable layer
    if (!sourceLayer || !targetLayer) continue;

    // Skip if same layer
    if (sourceLayer.level === targetLayer.level) continue;

    // Violation: lower layer imports higher layer
    if (sourceLayer.level < targetLayer.level) {
      const severity: FindingSeverity =
        targetLayer.level - sourceLayer.level > 2 ? "high" : "medium";

      findings.push({
        category: "layering",
        severity,
        title: `Upward dependency: ${sourceLayer.name} -> ${targetLayer.name}`,
        description:
          `File ${edge.sourceFilePath} (${sourceLayer.name} layer, level ${sourceLayer.level}) ` +
          `imports ${edge.targetFilePath} (${targetLayer.name} layer, level ${targetLayer.level}). ` +
          `Lower layers should not depend on higher layers.`,
        evidence: {
          sourceFileId: edge.sourceFileId,
          sourceFilePath: edge.sourceFilePath,
          sourceLayer: sourceLayer.name,
          sourceLevel: sourceLayer.level,
          targetFileId: edge.targetFileId,
          targetFilePath: edge.targetFilePath,
          targetLayer: targetLayer.name,
          targetLevel: targetLayer.level,
        },
        suggestion:
          "Introduce an abstraction (interface or event) at the lower layer " +
          "that the higher layer can implement. This inverts the dependency " +
          "and respects the layering boundary.",
      });
    }

    // Violation: skipping layers (higher layer importing from a layer more than 1 below)
    if (
      sourceLayer.level > targetLayer.level &&
      sourceLayer.level - targetLayer.level > 1
    ) {
      findings.push({
        category: "layering",
        severity: "low",
        title: `Layer skip: ${sourceLayer.name} -> ${targetLayer.name}`,
        description:
          `File ${edge.sourceFilePath} (${sourceLayer.name} layer, level ${sourceLayer.level}) ` +
          `imports ${edge.targetFilePath} (${targetLayer.name} layer, level ${targetLayer.level}), ` +
          `skipping ${sourceLayer.level - targetLayer.level - 1} intermediate layer(s).`,
        evidence: {
          sourceFileId: edge.sourceFileId,
          sourceFilePath: edge.sourceFilePath,
          sourceLayer: sourceLayer.name,
          sourceLevel: sourceLayer.level,
          targetFileId: edge.targetFileId,
          targetFilePath: edge.targetFilePath,
          targetLayer: targetLayer.name,
          targetLevel: targetLayer.level,
          skippedLayers: sourceLayer.level - targetLayer.level - 1,
        },
        suggestion:
          "Route the dependency through intermediate layers. For example, " +
          "if the UI layer needs data, it should go through the service layer " +
          "rather than accessing the data layer directly.",
      });
    }
  }

  return findings;
}
