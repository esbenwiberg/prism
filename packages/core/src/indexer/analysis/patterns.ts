/**
 * Pattern detection orchestrator.
 *
 * Runs all detectors (circular deps, dead code, god modules, layering,
 * coupling) and collects findings. This is the main entry point for
 * pattern detection in Layer 4.
 */

import { logger } from "../../logger.js";
import {
  getDependenciesByProjectId,
  getProjectFiles,
  getSymbolsByProjectId,
  bulkInsertFindings,
  deleteFindingsByProjectId,
} from "../../db/queries/index.js";

import {
  detectCircularDeps,
  detectDeadCode,
  detectGodModules,
  detectLayeringViolations,
  detectCouplingIssues,
  type DetectorFinding,
  type DepEdge,
  type SymbolInfo,
  type SymbolReference,
  type FileMetricsInput,
  type LayeringEdge,
  type CouplingMetricsInput,
} from "./detectors/index.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run all pattern detectors on a project and persist findings.
 *
 * Clears existing findings for the project before inserting new ones
 * to ensure a clean analysis.
 *
 * @param projectId — The project to analyse.
 * @returns The total number of findings detected.
 */
export async function runPatternDetection(
  projectId: number,
): Promise<{ findings: DetectorFinding[]; count: number }> {
  logger.info({ projectId }, "Starting pattern detection");

  // Load data from DB
  const [dbFiles, dbDeps, dbSymbols] = await Promise.all([
    getProjectFiles(projectId),
    getDependenciesByProjectId(projectId),
    getSymbolsByProjectId(projectId),
  ]);

  // Build lookup maps
  const fileIdToPath = new Map<number, string>();
  for (const f of dbFiles) {
    fileIdToPath.set(f.id, f.path);
  }

  // Collect all findings
  const allFindings: DetectorFinding[] = [];

  // 1. Circular dependency detection
  const depEdges: DepEdge[] = dbDeps
    .filter((d) => d.targetFileId != null)
    .map((d) => ({
      sourceFileId: d.sourceFileId,
      targetFileId: d.targetFileId!,
    }));

  const circularFindings = detectCircularDeps(depEdges, fileIdToPath);
  allFindings.push(...circularFindings);
  logger.debug({ count: circularFindings.length }, "Circular dependency findings");

  // 2. Dead code detection
  const symbolInfos: SymbolInfo[] = dbSymbols.map((s) => ({
    id: s.id,
    fileId: s.fileId,
    name: s.name,
    kind: s.kind,
    exported: s.exported,
  }));

  const symbolRefs: SymbolReference[] = dbDeps
    .filter((d) => d.targetSymbolId != null)
    .map((d) => ({
      sourceFileId: d.sourceFileId,
      targetSymbolId: d.targetSymbolId!,
    }));

  const deadCodeFindings = detectDeadCode(symbolInfos, symbolRefs, fileIdToPath);
  allFindings.push(...deadCodeFindings);
  logger.debug({ count: deadCodeFindings.length }, "Dead code findings");

  // 3. God module detection
  // Compute fan-in and fan-out per file
  const fanOutMap = new Map<number, Set<number>>();
  const fanInMap = new Map<number, Set<number>>();
  for (const dep of dbDeps) {
    if (dep.targetFileId == null) continue;

    if (!fanOutMap.has(dep.sourceFileId)) {
      fanOutMap.set(dep.sourceFileId, new Set());
    }
    fanOutMap.get(dep.sourceFileId)!.add(dep.targetFileId);

    if (!fanInMap.has(dep.targetFileId)) {
      fanInMap.set(dep.targetFileId, new Set());
    }
    fanInMap.get(dep.targetFileId)!.add(dep.sourceFileId);
  }

  // Count symbols per file
  const symbolCountByFile = new Map<number, number>();
  for (const s of dbSymbols) {
    symbolCountByFile.set(s.fileId, (symbolCountByFile.get(s.fileId) ?? 0) + 1);
  }

  const godModuleMetrics: FileMetricsInput[] = dbFiles.map((f) => ({
    fileId: f.id,
    filePath: f.path,
    fanOut: fanOutMap.get(f.id)?.size ?? 0,
    fanIn: fanInMap.get(f.id)?.size ?? 0,
    symbolCount: symbolCountByFile.get(f.id) ?? 0,
    lineCount: f.lineCount ?? 0,
  }));

  const godModuleFindings = detectGodModules(godModuleMetrics);
  allFindings.push(...godModuleFindings);
  logger.debug({ count: godModuleFindings.length }, "God module findings");

  // 4. Layering violation detection
  const layeringEdges: LayeringEdge[] = dbDeps
    .filter((d) => d.targetFileId != null)
    .map((d) => ({
      sourceFileId: d.sourceFileId,
      sourceFilePath: fileIdToPath.get(d.sourceFileId) ?? "",
      targetFileId: d.targetFileId!,
      targetFilePath: fileIdToPath.get(d.targetFileId!) ?? "",
    }))
    .filter((e) => e.sourceFilePath && e.targetFilePath);

  const layeringFindings = detectLayeringViolations(layeringEdges);
  allFindings.push(...layeringFindings);
  logger.debug({ count: layeringFindings.length }, "Layering violation findings");

  // 5. Coupling/cohesion detection
  const couplingMetrics: CouplingMetricsInput[] = dbFiles.map((f) => {
    const efferent = fanOutMap.get(f.id)?.size ?? 0;
    const afferent = fanInMap.get(f.id)?.size ?? 0;
    return {
      fileId: f.id,
      filePath: f.path,
      efferentCoupling: efferent,
      afferentCoupling: afferent,
      cohesion: f.cohesion ? Number(f.cohesion) : 0,
      totalCoupling: efferent + afferent,
    };
  });

  const couplingFindings = detectCouplingIssues(couplingMetrics);
  allFindings.push(...couplingFindings);
  logger.debug({ count: couplingFindings.length }, "Coupling findings");

  // Clear old findings and persist new ones
  await deleteFindingsByProjectId(projectId);

  if (allFindings.length > 0) {
    await bulkInsertFindings(
      allFindings.map((f) => ({
        projectId,
        category: f.category as import("../../domain/types.js").FindingCategory,
        severity: f.severity,
        title: f.title,
        description: f.description,
        evidence: f.evidence,
        suggestion: f.suggestion,
      })),
    );
  }

  logger.info(
    {
      projectId,
      totalFindings: allFindings.length,
      circular: circularFindings.length,
      deadCode: deadCodeFindings.length,
      godModule: godModuleFindings.length,
      layering: layeringFindings.length,
      coupling: couplingFindings.length,
    },
    "Pattern detection complete",
  );

  return { findings: allFindings, count: allFindings.length };
}
