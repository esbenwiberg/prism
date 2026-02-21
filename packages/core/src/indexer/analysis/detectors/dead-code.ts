/**
 * Dead code detector.
 *
 * Finds exported symbols that have zero inbound references from other files.
 * These are candidates for dead code — symbols that are exported but never
 * imported or used elsewhere in the project.
 */

import type { FindingCategory, FindingSeverity } from "../../../domain/types.js";
import type { DetectorFinding } from "./circular-deps.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal symbol info needed for dead-code detection. */
export interface SymbolInfo {
  id: number;
  fileId: number;
  name: string;
  kind: string;
  exported: boolean;
}

/** A dependency edge referencing a symbol. */
export interface SymbolReference {
  /** File that contains the reference. */
  sourceFileId: number;
  /** Symbol being referenced (target). */
  targetSymbolId: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect dead code candidates — exported symbols with zero inbound
 * references from other files.
 *
 * @param symbols     — All symbols in the project.
 * @param references  — All symbol-level dependency references.
 * @param fileIdToPath — Map from file ID to project-relative path.
 * @returns Findings for each dead code candidate.
 */
export function detectDeadCode(
  symbols: SymbolInfo[],
  references: SymbolReference[],
  fileIdToPath: Map<number, string>,
): DetectorFinding[] {
  // Build a set of symbol IDs that are referenced from other files
  const referencedSymbolIds = new Set<number>();
  for (const ref of references) {
    referencedSymbolIds.add(ref.targetSymbolId);
  }

  // Find exported symbols with no inbound references
  const deadCandidates = symbols.filter(
    (sym) => sym.exported && !referencedSymbolIds.has(sym.id),
  );

  // Group by file for better reporting
  const byFile = new Map<number, SymbolInfo[]>();
  for (const sym of deadCandidates) {
    const list = byFile.get(sym.fileId) ?? [];
    list.push(sym);
    byFile.set(sym.fileId, list);
  }

  const findings: DetectorFinding[] = [];

  for (const [fileId, fileSymbols] of byFile) {
    const filePath = fileIdToPath.get(fileId) ?? `file#${fileId}`;
    const names = fileSymbols.map((s) => s.name);
    const severity: FindingSeverity =
      fileSymbols.length > 5 ? "medium" : "low";

    findings.push({
      category: "dead-code",
      severity,
      title: `${fileSymbols.length} unused export${fileSymbols.length > 1 ? "s" : ""} in ${filePath}`,
      description:
        `The following exported symbols have zero inbound references from ` +
        `other files: ${names.join(", ")}`,
      evidence: {
        fileId,
        filePath,
        symbols: fileSymbols.map((s) => ({
          id: s.id,
          name: s.name,
          kind: s.kind,
        })),
        count: fileSymbols.length,
      },
      suggestion:
        "Review whether these exports are needed. They may be entry points, " +
        "test utilities, or genuinely unused code that can be removed.",
    });
  }

  return findings;
}
