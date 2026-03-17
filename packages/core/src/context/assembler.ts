/**
 * Context assembler — orchestrates signal collectors, ranks, truncates.
 *
 * Each public function corresponds to one MCP tool / REST endpoint.
 * All intelligence is at index time; this is pure data retrieval + ranking.
 */

import { getFileByPath, type FileRow } from "../db/queries/files.js";
import { getProjectFiles } from "../db/queries/files.js";
import { getFilesByDirectory } from "../db/queries/files.js";
import { getExportedSymbolsByFileId } from "../db/queries/symbols.js";
import { getSymbolsByFileId } from "../db/queries/symbols.js";
import {
  getDependenciesBySourceFileId,
  getDependenciesByTargetFileId,
  getDependenciesByProjectId,
} from "../db/queries/dependencies.js";
import { getSummariesByLevel } from "../db/queries/summaries.js";

import {
  collectFileSummaries,
  collectModuleSummaries,
  collectArchitectureSummaries,
  collectFileSummariesBatch,
} from "./signals/summaries.js";
import { collectGraphSignal, getRelatedFileIds } from "./signals/graph.js";
import {
  collectFindingsByFilePath,
  collectFindingsByModulePath,
  collectCriticalFindings,
} from "./signals/findings.js";
import {
  getRecentCommitsByProjectId,
  getRecentCommitsByFileId,
  type CommitRow,
} from "../db/queries/commits.js";
import { collectSemanticSignal } from "./signals/semantic.js";
import {
  getCoChangedFiles,
  getChangeHotspots,
} from "../db/queries/commits.js";
import {
  collectChangeSignals,
  collectReviewSignals,
} from "./signals/history.js";
import { computeRelevance, mergeRankedItems } from "./ranker.js";
import { signalsToSections, truncateSections } from "./truncator.js";
import { formatContextAsMarkdown } from "./formatter.js";

import type { ContextResponse, SignalResult } from "./types.js";

// ---------------------------------------------------------------------------
// get_file_context
// ---------------------------------------------------------------------------

export interface FileContextInput {
  projectId: number;
  filePath: string;
  intent?: string;
  maxTokens?: number;
}

export async function assembleFileContext(
  input: FileContextInput,
): Promise<ContextResponse> {
  const { projectId, filePath, intent, maxTokens = 4000 } = input;

  const file = await getFileByPath(projectId, filePath);
  if (!file) {
    return {
      sections: [
        {
          heading: "Error",
          priority: 1,
          content: `File "${filePath}" not found in the index.`,
          tokenCount: 15,
        },
      ],
      totalTokens: 15,
      truncated: false,
    };
  }

  // Fan-out: collect signals in parallel
  const [summarySignal, graphSignals, findingsSignal, symbols] =
    await Promise.all([
      collectFileSummaries(projectId, filePath),
      collectGraphSignal({ projectId, fileId: file.id }),
      collectFindingsByFilePath(projectId, filePath),
      getExportedSymbolsByFileId(file.id),
    ]);

  // Build symbols section
  const symbolsSignal: SignalResult = {
    heading: "Exported Symbols",
    priority: 4,
    items: symbols.map((s) => ({
      content: `\`${s.signature || s.name}\` (${s.kind})`,
      relevance: 0.6,
    })),
  };

  // Enrich graph signals with file summaries
  const allGraphFileIds = new Set<number>();
  const forwardDeps = await getDependenciesBySourceFileId(file.id);
  const reverseDeps = await getDependenciesByTargetFileId(file.id);
  for (const d of forwardDeps) if (d.targetFileId) allGraphFileIds.add(d.targetFileId);
  for (const d of reverseDeps) allGraphFileIds.add(d.sourceFileId);

  const allFiles = await getProjectFiles(projectId);
  const fileMap = new Map<number, FileRow>(allFiles.map((f) => [f.id, f]));
  const graphFilePaths = [...allGraphFileIds]
    .map((id) => fileMap.get(id)?.path)
    .filter((p): p is string => p != null);
  const summaryMap = await collectFileSummariesBatch(projectId, graphFilePaths);

  // Enrich blast radius items with summaries
  const enrichedReverse: SignalResult = {
    ...graphSignals.reverse,
    items: graphSignals.reverse.items.map((item) => {
      const path = extractPathFromContent(item.content);
      const summary = path ? summaryMap.get(path) : null;
      return summary
        ? { ...item, content: `${item.content}\n${summary}` }
        : item;
    }),
  };

  // Enrich forward deps with summaries
  const enrichedForward: SignalResult = {
    ...graphSignals.forward,
    items: graphSignals.forward.items.map((item) => {
      const path = extractPathFromContent(item.content);
      const summary = path ? summaryMap.get(path) : null;
      return summary
        ? { ...item, content: `${item.content}\n${summary}` }
        : item;
    }),
  };

  const signals: SignalResult[] = [
    summarySignal,
    enrichedReverse,
    enrichedForward,
    symbolsSignal,
    findingsSignal,
  ];

  // History: change frequency + co-changed files
  try {
    const historyItems = [];
    if (file.changeFrequency && file.changeFrequency > 0) {
      const isHotspot = file.changeFrequency > 10;
      historyItems.push({
        content: `Changed ${file.changeFrequency} times${isHotspot ? " (**hotspot**)" : ""}${file.lastChangedAt ? ` — last changed ${file.lastChangedAt.toISOString().slice(0, 10)}` : ""}`,
        relevance: isHotspot ? 0.9 : 0.5,
      });
    }

    const coChanged = await getCoChangedFiles(projectId, file.id, 5);
    for (const c of coChanged) {
      historyItems.push({
        content: `Co-changes with **${c.filePath}** (${c.coChangeCount} times)`,
        relevance: Math.min(1, c.coChangeCount / 10),
      });
    }

    if (historyItems.length > 0) {
      signals.push({
        heading: "Change History",
        priority: 4,
        items: historyItems,
      });
    }
  } catch {
    // History tables may not exist yet — gracefully skip
  }

  // Optional: intent-matched semantic search
  if (intent) {
    const semanticSignal = await collectSemanticSignal({
      projectId,
      query: intent,
      limit: 8,
      heading: "Intent-Matched Results",
      priority: 6,
      intent,
    });
    signals.push(semanticSignal);
  }

  const sections = signalsToSections(signals);
  return truncateSections(sections, maxTokens);
}

// ---------------------------------------------------------------------------
// get_module_context
// ---------------------------------------------------------------------------

export interface ModuleContextInput {
  projectId: number;
  modulePath: string;
  maxTokens?: number;
}

export async function assembleModuleContext(
  input: ModuleContextInput,
): Promise<ContextResponse> {
  const { projectId, modulePath, maxTokens = 3000 } = input;

  const [summarySignal, filesInModule, findingsSignal, allDeps] =
    await Promise.all([
      collectModuleSummaries(projectId, modulePath),
      getFilesByDirectory(projectId, modulePath),
      collectFindingsByModulePath(projectId, modulePath),
      getDependenciesByProjectId(projectId),
    ]);

  if (filesInModule.length === 0) {
    return {
      sections: [
        {
          heading: "Error",
          priority: 1,
          content: `No files found in module "${modulePath}".`,
          tokenCount: 15,
        },
      ],
      totalTokens: 15,
      truncated: false,
    };
  }

  // File summaries for all files in module
  const filePaths = filesInModule.map((f) => f.path);
  const summaryMap = await collectFileSummariesBatch(projectId, filePaths);

  const fileListSignal: SignalResult = {
    heading: "Files in Module",
    priority: 2,
    items: filesInModule.map((f) => {
      const summary = summaryMap.get(f.path) ?? "";
      const metrics = [
        f.complexity ? `complexity: ${f.complexity}` : null,
        f.lineCount ? `${f.lineCount} lines` : null,
      ]
        .filter(Boolean)
        .join(", ");
      return {
        content: `**${f.path}** ${metrics ? `(${metrics})` : ""}\n${summary}`,
        relevance: 0.7,
      };
    }),
  };

  // External dependencies (crossing module boundary)
  const moduleFileIds = new Set(filesInModule.map((f) => f.id));
  const externalDeps = allDeps.filter(
    (d) =>
      moduleFileIds.has(d.sourceFileId) &&
      d.targetFileId != null &&
      !moduleFileIds.has(d.targetFileId),
  );

  const allFiles = await getProjectFiles(projectId);
  const fileMap = new Map<number, FileRow>(allFiles.map((f) => [f.id, f]));
  const externalPaths = [
    ...new Set(
      externalDeps
        .map((d) => (d.targetFileId ? fileMap.get(d.targetFileId)?.path : null))
        .filter((p): p is string => p != null),
    ),
  ];

  const externalDepsSignal: SignalResult = {
    heading: "External Dependencies",
    priority: 3,
    items: externalPaths.map((p) => ({
      content: `→ ${p}`,
      relevance: 0.5,
    })),
  };

  // Key exports
  const exportPromises = filesInModule.map(async (f) => {
    const syms = await getExportedSymbolsByFileId(f.id);
    return syms.map((s) => ({
      content: `\`${s.signature || s.name}\` from ${f.path} (${s.kind})`,
      relevance: 0.5,
    }));
  });
  const allExports = (await Promise.all(exportPromises)).flat();

  const exportsSignal: SignalResult = {
    heading: "Key Exports",
    priority: 4,
    items: allExports,
  };

  const signals = [
    summarySignal,
    fileListSignal,
    externalDepsSignal,
    exportsSignal,
    findingsSignal,
  ];

  const sections = signalsToSections(signals);
  return truncateSections(sections, maxTokens);
}

// ---------------------------------------------------------------------------
// get_related_files
// ---------------------------------------------------------------------------

export interface RelatedFilesInput {
  projectId: number;
  query: string;
  maxResults?: number;
  includeTests?: boolean;
}

export interface RelatedFileResult {
  path: string;
  score: number;
  summary: string;
  relationship: string;
}

export async function assembleRelatedFiles(
  input: RelatedFilesInput,
): Promise<RelatedFileResult[]> {
  const { projectId, query, maxResults = 15, includeTests = false } = input;

  // Run semantic search
  const semanticSignal = await collectSemanticSignal({
    projectId,
    query,
    limit: maxResults * 2,
    includeTests,
  });

  // Try graph traversal if query looks like a file path
  let graphFileScores = new Map<number, number>();
  const allFiles = await getProjectFiles(projectId);
  const fileByPath = new Map(allFiles.map((f) => [f.path, f]));

  const queryFile = fileByPath.get(query);
  if (queryFile) {
    graphFileScores = await getRelatedFileIds(projectId, queryFile.id, 2);
  }

  // Build path → score map from semantic results
  const semanticScores = new Map<string, number>();
  for (const item of semanticSignal.items) {
    const path = extractPathFromContent(item.content);
    if (path && !semanticScores.has(path)) {
      semanticScores.set(path, item.relevance);
    }
  }

  // Build path → score map from graph results
  const graphPathScores = new Map<string, number>();
  const fileMap = new Map<number, FileRow>(allFiles.map((f) => [f.id, f]));
  for (const [fileId, depth] of graphFileScores) {
    const file = fileMap.get(fileId);
    if (file) {
      graphPathScores.set(file.path, 1 / depth);
    }
  }

  // Co-change boost: if query is a file path, boost files that co-change with it
  const coChangeScores = new Map<string, number>();
  if (queryFile) {
    try {
      const coChanged = await getCoChangedFiles(projectId, queryFile.id, 20);
      for (const c of coChanged) {
        coChangeScores.set(c.filePath, Math.min(1, c.coChangeCount / 10));
      }
    } catch {
      // History tables may not exist — skip
    }
  }

  // Merge scores
  const allPaths = new Set([
    ...semanticScores.keys(),
    ...graphPathScores.keys(),
    ...coChangeScores.keys(),
  ]);
  const scored: Array<{ path: string; score: number; relationship: string }> = [];

  for (const path of allPaths) {
    const semantic = semanticScores.get(path) ?? 0;
    const graph = graphPathScores.get(path) ?? 0;
    const coChange = coChangeScores.get(path) ?? 0;
    const combined = semantic * 0.5 + graph * 0.3 + coChange * 0.2;
    const boost = (semantic > 0 && graph > 0 ? 0.1 : 0) + (coChange > 0 ? 0.05 : 0);

    // Determine relationship type
    let relationship = "semantic";
    if (graph > 0 && semantic > 0) relationship = "semantic + dependency";
    else if (graph > 0) relationship = "dependency";
    if (coChange > 0) relationship += " + co-change";

    // Test file penalty
    const file = fileByPath.get(path);
    if (!includeTests && file?.isTest) continue;

    scored.push({ path, score: combined + boost, relationship });
  }

  scored.sort((a, b) => b.score - a.score);
  const topResults = scored.slice(0, maxResults);

  // Fetch summaries for top results
  const summaryMap = await collectFileSummariesBatch(
    projectId,
    topResults.map((r) => r.path),
  );

  return topResults.map((r) => ({
    path: r.path,
    score: r.score,
    summary: summaryMap.get(r.path) ?? "",
    relationship: r.relationship,
  }));
}

// ---------------------------------------------------------------------------
// get_architecture_overview
// ---------------------------------------------------------------------------

export interface ArchitectureOverviewInput {
  projectId: number;
  maxTokens?: number;
}

export async function assembleArchitectureOverview(
  input: ArchitectureOverviewInput,
): Promise<ContextResponse> {
  const { projectId, maxTokens = 5000 } = input;

  const [archSummaries, criticalFindings, allDeps] = await Promise.all([
    collectArchitectureSummaries(projectId),
    collectCriticalFindings(projectId),
    getDependenciesByProjectId(projectId),
  ]);

  // Build inter-module dependency graph
  const allFiles = await getProjectFiles(projectId);
  const fileMap = new Map<number, FileRow>(allFiles.map((f) => [f.id, f]));

  const moduleEdges = new Map<string, Set<string>>();
  for (const dep of allDeps) {
    if (!dep.targetFileId) continue;
    const sourceFile = fileMap.get(dep.sourceFileId);
    const targetFile = fileMap.get(dep.targetFileId);
    if (!sourceFile || !targetFile) continue;

    const sourceModule = getTopLevelModule(sourceFile.path);
    const targetModule = getTopLevelModule(targetFile.path);
    if (sourceModule && targetModule && sourceModule !== targetModule) {
      if (!moduleEdges.has(sourceModule)) moduleEdges.set(sourceModule, new Set());
      moduleEdges.get(sourceModule)!.add(targetModule);
    }
  }

  const interModuleSignal: SignalResult = {
    heading: "Inter-Module Dependencies",
    priority: 3,
    items:
      moduleEdges.size > 0
        ? [...moduleEdges.entries()].map(([from, toSet]) => ({
            content: `${from} → ${[...toSet].join(", ")}`,
            relevance: 0.6,
          }))
        : [{ content: "No cross-module dependencies detected.", relevance: 0.3 }],
  };

  // Hotspot summary from history
  let hotspotsSignal: SignalResult = { heading: "Hotspots", priority: 5, items: [] };
  try {
    const hotspots = await getChangeHotspots(projectId, 10);
    if (hotspots.length > 0) {
      hotspotsSignal = {
        heading: "Change Hotspots",
        priority: 5,
        items: hotspots.map((h) => ({
          content: `**${h.filePath}** — ${h.changeCount} changes`,
          relevance: Math.min(1, h.changeCount / 20),
        })),
      };
    }
  } catch {
    // History tables may not exist — skip
  }

  const signals = [
    archSummaries.purpose,
    archSummaries.system,
    archSummaries.modules,
    interModuleSignal,
    criticalFindings,
    hotspotsSignal,
  ];

  const sections = signalsToSections(signals);
  return truncateSections(sections, maxTokens);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractPathFromContent(content: string): string | null {
  // Extract path from "**path/to/file**" markdown bold
  const match = content.match(/\*\*([^*]+)\*\*/);
  if (!match) return null;
  const path = match[1];
  // Filter out non-path-like strings
  if (path.includes(" ") && !path.includes("/")) return null;
  // Strip "(depth N)" suffix
  return path.replace(/\s*\(depth \d+\)/, "");
}

// ---------------------------------------------------------------------------
// get_change_context
// ---------------------------------------------------------------------------

export interface ChangeContextInput {
  projectId: number;
  filePath?: string;
  modulePath?: string;
  since?: string;
  until?: string;
  maxCommits?: number;
  maxTokens?: number;
}

export async function assembleChangeContext(
  input: ChangeContextInput,
): Promise<ContextResponse> {
  const {
    projectId,
    filePath,
    modulePath,
    since,
    until,
    maxCommits,
    maxTokens = 4000,
  } = input;

  const signals = await collectChangeSignals({
    projectId,
    filePath,
    modulePath,
    since: since ? new Date(since) : undefined,
    until: until ? new Date(until) : undefined,
    maxCommits,
  });

  const sections = signalsToSections(signals);
  return truncateSections(sections, maxTokens);
}

// ---------------------------------------------------------------------------
// get_review_context
// ---------------------------------------------------------------------------

export interface ReviewContextInput {
  projectId: number;
  since: string;
  until?: string;
  maxTokens?: number;
}

export async function assembleReviewContext(
  input: ReviewContextInput,
): Promise<ContextResponse> {
  const {
    projectId,
    since,
    until,
    maxTokens = 8000,
  } = input;

  const sinceDate = new Date(since);
  const untilDate = until ? new Date(until) : new Date();

  const signals = await collectReviewSignals({
    projectId,
    since: sinceDate,
    until: untilDate,
  });

  const sections = signalsToSections(signals);
  return truncateSections(sections, maxTokens);
}

// ---------------------------------------------------------------------------
// enrich_task_context
// ---------------------------------------------------------------------------

export interface TaskContextInput {
  projectId: number;
  query: string;
  maxTokens?: number;
}

export async function assembleTaskContext(
  input: TaskContextInput,
): Promise<ContextResponse> {
  const { projectId, query, maxTokens = 16000 } = input;

  // 1. Semantic search — find relevant files/symbols
  const semanticSignal = await collectSemanticSignal({
    projectId,
    query,
    limit: 20,
    intent: query,
  });

  // 2. Extract top file paths from semantic results
  const topFilePaths = extractTopFilePaths(semanticSignal, 5);

  // 3. Resolve file IDs for graph signals (top 3)
  const allFiles = await getProjectFiles(projectId);
  const fileByPath = new Map(allFiles.map((f) => [f.path, f]));
  const top3Files = topFilePaths.slice(0, 3);
  const top3FileIds = top3Files
    .map((p) => fileByPath.get(p))
    .filter((f): f is FileRow => f != null);

  // 4. Fan-out: collect signals in parallel (no findings — too generic for task context)
  const [archSummaries, fileSummaryMap, recentProjectCommits, ...graphResults] =
    await Promise.all([
      collectArchitectureSummaries(projectId),
      collectFileSummariesBatch(projectId, topFilePaths),
      getRecentCommitsByProjectId(projectId, 10),
      ...top3FileIds.map((f) => collectGraphSignal({ projectId, fileId: f.id })),
    ]);

  // Collect commits for each of the top found files (scoped history)
  let fileCommits: CommitRow[] = [];
  try {
    const perFileCommits = await Promise.all(
      top3FileIds.map((f) => getRecentCommitsByFileId(f.id, 10)),
    );
    // Merge and deduplicate by sha, sort by date descending
    const seen = new Set<string>();
    for (const batch of perFileCommits) {
      for (const c of batch) {
        if (!seen.has(c.sha)) {
          seen.add(c.sha);
          fileCommits.push(c);
        }
      }
    }
    fileCommits.sort(
      (a, b) =>
        (b.committedAt?.getTime() ?? 0) - (a.committedAt?.getTime() ?? 0),
    );
    fileCommits = fileCommits.slice(0, 15);
  } catch {
    // History tables may not exist — gracefully skip
  }

  // 5. Build signals array with priorities

  const signals: SignalResult[] = [];

  // Priority 1: Architecture (purpose + system summary)
  signals.push(
    { ...archSummaries.purpose, priority: 1 },
    { ...archSummaries.system, priority: 1 },
  );

  // Priority 2: Semantic search results
  signals.push({
    ...semanticSignal,
    heading: "Relevant Code",
    priority: 2,
  });

  // Priority 2: File summaries for top hits
  if (fileSummaryMap.size > 0) {
    signals.push({
      heading: "File Summaries",
      priority: 2,
      items: topFilePaths
        .filter((p) => fileSummaryMap.has(p))
        .map((p) => ({
          content: `**${p}**\n${fileSummaryMap.get(p)}`,
          relevance: 0.8,
        })),
    });
  }

  // Priority 3: Blast radius + dependencies (top 3 files)
  for (let i = 0; i < graphResults.length; i++) {
    const graph = graphResults[i] as { forward: SignalResult; reverse: SignalResult };
    const filePath = top3Files[i];
    if (graph.reverse.items.length > 0) {
      signals.push({
        ...graph.reverse,
        heading: `Blast Radius — ${filePath}`,
        priority: 3,
      });
    }
    if (graph.forward.items.length > 0) {
      signals.push({
        ...graph.forward,
        heading: `Dependencies — ${filePath}`,
        priority: 3,
      });
    }
  }

  // Priority 3: Commits touching the found files (scoped history)
  if (fileCommits.length > 0) {
    signals.push({
      heading: "Commits for Relevant Files",
      priority: 3,
      items: fileCommits.map((c) => ({
        content: `\`${c.sha.slice(0, 7)}\` ${c.message}${c.authorName ? ` — ${c.authorName}` : ""}${c.committedAt ? ` (${c.committedAt.toISOString().slice(0, 10)})` : ""}`,
        relevance: 0.8,
      })),
    });
  }

  // Priority 4: Most recent project commits (broader context)
  if (recentProjectCommits.length > 0) {
    // Exclude commits already shown in file-scoped section
    const fileCommitShas = new Set(fileCommits.map((c) => c.sha));
    const uniqueProjectCommits = recentProjectCommits.filter(
      (c) => !fileCommitShas.has(c.sha),
    );
    if (uniqueProjectCommits.length > 0) {
      signals.push({
        heading: "Recent Commits",
        priority: 4,
        items: uniqueProjectCommits.map((c) => ({
          content: `\`${c.sha.slice(0, 7)}\` ${c.message}${c.authorName ? ` — ${c.authorName}` : ""}${c.committedAt ? ` (${c.committedAt.toISOString().slice(0, 10)})` : ""}`,
          relevance: 0.6,
        })),
      });
    }
  }

  const sections = signalsToSections(signals);
  return truncateSections(sections, maxTokens);
}

/** Extract unique file paths from semantic signal items. */
function extractTopFilePaths(signal: SignalResult, limit: number): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const item of signal.items) {
    const path = extractPathFromContent(item.content);
    if (path && !seen.has(path)) {
      seen.add(path);
      paths.push(path);
      if (paths.length >= limit) break;
    }
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTopLevelModule(filePath: string): string | null {
  const parts = filePath.split("/");
  // Use first two path segments as module identifier
  // e.g. "src/db/queries/files.ts" → "src/db"
  if (parts.length >= 2) {
    return parts.slice(0, 2).join("/");
  }
  return parts[0] || null;
}
