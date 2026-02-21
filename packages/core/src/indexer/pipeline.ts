/**
 * Indexing pipeline orchestrator.
 *
 * Coordinates file walking, tree-sitter parsing, symbol extraction,
 * dependency graph building, metrics computation, and database persistence.
 *
 * The pipeline supports incremental re-indexing via SHA-256 content hashes
 * and git diff to detect changed files.
 */

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { logger } from "../logger.js";
import { getConfig } from "../domain/config.js";
import {
  upsertFile,
  fileNeedsReindex,
  deleteSymbolsByFileId,
  deleteDependenciesBySourceFileId,
  bulkInsertSymbols,
  bulkInsertDependencies,
  createIndexRun,
  updateIndexRunProgress,
  completeIndexRun,
  failIndexRun,
  updateProject,
  updateFileDocContent,
} from "../db/queries/index.js";

import type {
  IndexContext,
  LayerResult,
  FileEntry,
  StructuralFileResult,
  DependencyEdge,
} from "./types.js";
import { createBudgetTracker } from "./types.js";
import type { LayerName, Project } from "../domain/types.js";

import { detectLanguage } from "./structural/languages.js";
import { parseSource, initTreeSitter } from "./structural/parser.js";
import { extractSymbols } from "./structural/extractor.js";
import { extractDependencies } from "./structural/graph.js";
import { computeComplexity, computeFileMetrics } from "./structural/metrics.js";

// Docs layer imports
import { parseDocFiles } from "./docs/readme.js";
import { extractCommentsFromFiles } from "./docs/comments.js";
import { parseConfigFiles, buildTechStack, buildConfigDocContent } from "./docs/config.js";
import { assembleIntent, buildIntentDocContent } from "./docs/intent.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// File-matching helpers
// ---------------------------------------------------------------------------

/**
 * Check whether a project-relative path matches any of the skip patterns.
 * Uses simple glob matching (supports `*` and `**`).
 */
function matchesSkipPattern(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globMatch(pattern, filePath));
}

/**
 * Minimal glob matcher supporting `*` (one segment) and `**` (any depth).
 */
function globMatch(pattern: string, path: string): boolean {
  // Convert glob to regex
  let re = "^";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        // **  — match any number of path segments
        if (pattern[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
      } else {
        // * — match anything except /
        re += "[^/]*";
        i++;
      }
    } else if (c === "?") {
      re += "[^/]";
      i++;
    } else if (c === ".") {
      re += "\\.";
      i++;
    } else {
      re += c;
      i++;
    }
  }
  re += "$";

  return new RegExp(re).test(path);
}

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

/**
 * Walk the project directory and return FileEntry objects for all files
 * that should be indexed.
 */
export async function walkProjectFiles(
  projectPath: string,
  skipPatterns: string[],
  maxFileSizeBytes: number,
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  async function walk(dir: string): Promise<void> {
    const { readdir } = await import("node:fs/promises");
    const items = await readdir(dir, { withFileTypes: true });

    for (const item of items) {
      const absPath = resolve(dir, item.name);
      const relPath = relative(projectPath, absPath).replace(/\\/g, "/");

      if (matchesSkipPattern(relPath, skipPatterns)) {
        continue;
      }

      if (item.isDirectory()) {
        // Check directory name against skip patterns before recursing
        if (matchesSkipPattern(relPath + "/", skipPatterns)) {
          continue;
        }
        await walk(absPath);
      } else if (item.isFile()) {
        const fileStat = await stat(absPath);
        if (fileStat.size > maxFileSizeBytes) {
          logger.debug({ path: relPath, size: fileStat.size }, "Skipping large file");
          continue;
        }

        const language = detectLanguage(relPath);
        // Include all files for the file list, even if language is unsupported
        // (they still get tracked in the DB for documentation layers, etc.)
        const content = await readFile(absPath, "utf-8");
        const hash = createHash("sha256").update(content).digest("hex");

        entries.push({
          path: relPath,
          absolutePath: absPath,
          content,
          language,
          sizeBytes: fileStat.size,
          lineCount: content.split("\n").length,
          contentHash: hash,
        });
      }
    }
  }

  await walk(projectPath);
  return entries;
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

/**
 * Get the current HEAD commit hash.
 */
async function getHeadCommit(projectPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
      cwd: projectPath,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get list of files changed between two commits.
 */
async function getChangedFiles(
  projectPath: string,
  fromCommit: string,
  toCommit: string,
): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["diff", "--name-only", `${fromCommit}..${toCommit}`],
      { cwd: projectPath },
    );
    return stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Structural layer
// ---------------------------------------------------------------------------

/**
 * Run the structural indexing layer on the given files.
 *
 * For each file with a supported language:
 * 1. Parse with tree-sitter
 * 2. Extract symbols
 * 3. Compute complexity
 * 4. Extract dependencies
 */
async function runStructuralLayer(
  files: FileEntry[],
  projectFiles: ReadonlySet<string>,
): Promise<StructuralFileResult[]> {
  await initTreeSitter();

  const results: StructuralFileResult[] = [];

  for (const file of files) {
    if (!file.language) {
      // Non-parseable file — still include with empty symbols/deps
      results.push({
        file,
        symbols: [],
        dependencies: [],
        complexity: 0,
      });
      continue;
    }

    try {
      const tree = await parseSource(file.content, file.language);
      const rootNode = tree.rootNode;

      // Extract symbols
      const symbols = extractSymbols(rootNode, file.language, file.content);

      // Compute per-file complexity
      const complexity = computeComplexity(rootNode, file.language);

      // Extract dependencies
      const deps = extractDependencies(
        rootNode,
        file.language,
        file.path,
        projectFiles,
      );

      tree.delete();

      results.push({ file, symbols, dependencies: deps, complexity });
    } catch (err) {
      logger.warn(
        { path: file.path, error: err instanceof Error ? err.message : String(err) },
        "Failed to parse file, skipping structural analysis",
      );
      results.push({
        file,
        symbols: [],
        dependencies: [],
        complexity: 0,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Persist structural results to the database.
 */
async function persistStructuralResults(
  projectId: number,
  results: StructuralFileResult[],
  allEdges: DependencyEdge[],
): Promise<void> {
  const config = getConfig();
  const batchSize = config.indexer.batchSize;

  // Build a map of path → file DB id for dependency resolution
  const fileIdMap = new Map<string, number>();

  // Process in batches
  for (let i = 0; i < results.length; i += batchSize) {
    const batch = results.slice(i, i + batchSize);

    for (const result of batch) {
      const { file, symbols, dependencies, complexity } = result;

      // Compute file-level metrics
      const metrics = computeFileMetrics(
        file.path,
        dependencies,
        allEdges,
        symbols,
      );

      // Upsert file
      const fileRow = await upsertFile({
        projectId,
        path: file.path,
        language: file.language,
        sizeBytes: file.sizeBytes,
        lineCount: file.lineCount,
        contentHash: file.contentHash,
        complexity: complexity.toFixed(2),
        coupling: (metrics.efferentCoupling + metrics.afferentCoupling).toFixed(2),
        cohesion: metrics.cohesion.toFixed(2),
        isDoc: isDocFile(file.path),
        isTest: isTestFile(file.path),
        isConfig: isConfigFile(file.path),
      });

      fileIdMap.set(file.path, fileRow.id);

      // Delete old symbols and re-insert
      await deleteSymbolsByFileId(fileRow.id);
      if (symbols.length > 0) {
        await bulkInsertSymbols(
          symbols.map((s) => ({
            fileId: fileRow.id,
            projectId,
            kind: s.kind,
            name: s.name,
            startLine: s.startLine,
            endLine: s.endLine,
            exported: s.exported,
            signature: s.signature,
            docstring: s.docstring,
            complexity: s.complexity != null ? s.complexity.toFixed(2) : null,
          })),
        );
      }

      // Delete old dependencies from this source file
      await deleteDependenciesBySourceFileId(fileRow.id);
    }
  }

  // Insert all dependency edges (need file IDs resolved first)
  for (const result of results) {
    const sourceFileId = fileIdMap.get(result.file.path);
    if (!sourceFileId) continue;

    const edgeInputs = result.dependencies
      .map((dep) => ({
        projectId,
        sourceFileId,
        targetFileId: dep.targetFile ? (fileIdMap.get(dep.targetFile) ?? null) : null,
        kind: dep.kind,
      }));

    if (edgeInputs.length > 0) {
      await bulkInsertDependencies(edgeInputs);
    }
  }
}

// ---------------------------------------------------------------------------
// File classification helpers
// ---------------------------------------------------------------------------

function isDocFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith(".md") ||
    lower.endsWith(".rst") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".adoc") ||
    lower.includes("readme") ||
    lower.includes("changelog") ||
    lower.includes("contributing")
  );
}

function isTestFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.includes(".test.") ||
    lower.includes(".spec.") ||
    lower.includes("__tests__") ||
    lower.includes("/test/") ||
    lower.includes("/tests/") ||
    lower.endsWith("_test.py") ||
    lower.endsWith("_test.go")
  );
}

function isConfigFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith(".json") ||
    lower.endsWith(".yaml") ||
    lower.endsWith(".yml") ||
    lower.endsWith(".toml") ||
    lower.endsWith(".ini") ||
    lower.endsWith(".env") ||
    lower.endsWith(".config.js") ||
    lower.endsWith(".config.ts") ||
    lower.includes("tsconfig") ||
    lower.includes("package.json")
  );
}

// ---------------------------------------------------------------------------
// Pipeline orchestrator
// ---------------------------------------------------------------------------

/**
 * Default layers in execution order.
 */
const DEFAULT_LAYERS: LayerName[] = [
  "structural",
  "docs",
  "semantic",
  "analysis",
  "blueprint",
];

/**
 * Run the indexing pipeline on a project.
 *
 * @param project       — the project to index
 * @param options       — pipeline options
 * @returns array of layer results
 */
export async function runPipeline(
  project: Project,
  options: {
    layers?: LayerName[];
    fullReindex?: boolean;
  } = {},
): Promise<LayerResult[]> {
  const config = getConfig();
  const layers = options.layers ?? DEFAULT_LAYERS;
  const fullReindex = options.fullReindex ?? false;

  const context: IndexContext = {
    project,
    config,
    layers,
    fullReindex,
    results: [],
    budget: createBudgetTracker(
      config.semantic.budgetUsd +
        config.analysis.budgetUsd +
        config.blueprint.budgetUsd,
    ),
  };

  logger.info(
    {
      projectId: project.id,
      projectPath: project.path,
      layers,
      fullReindex,
    },
    "Starting indexing pipeline",
  );

  for (const layer of layers) {
    const startTime = Date.now();
    let result: LayerResult;

    try {
      switch (layer) {
        case "structural":
          result = await executeStructuralLayer(context);
          break;

        case "docs":
          result = await executeDocsLayer(context);
          break;

        // Other layers are not yet implemented — mark as pending
        case "semantic":
        case "analysis":
        case "blueprint":
          logger.info({ layer }, "Layer not yet implemented, skipping");
          result = {
            layer,
            status: "pending",
            filesProcessed: 0,
            filesTotal: 0,
            durationMs: Date.now() - startTime,
            costUsd: 0,
          };
          break;
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : String(err);
      logger.error({ layer, error: errorMessage }, "Layer failed");
      result = {
        layer,
        status: "failed",
        filesProcessed: 0,
        filesTotal: 0,
        durationMs: Date.now() - startTime,
        costUsd: 0,
        error: errorMessage,
      };
    }

    context.results.push(result);

    // If a required layer fails, stop the pipeline
    if (result.status === "failed" && layer === "structural") {
      logger.error("Structural layer failed — aborting pipeline");
      break;
    }
  }

  logger.info(
    {
      projectId: project.id,
      results: context.results.map((r) => ({
        layer: r.layer,
        status: r.status,
        files: r.filesProcessed,
        durationMs: r.durationMs,
      })),
    },
    "Pipeline complete",
  );

  return context.results;
}

/**
 * Execute the structural indexing layer.
 */
async function executeStructuralLayer(
  context: IndexContext,
): Promise<LayerResult> {
  const { project, config, fullReindex } = context;
  const startTime = Date.now();

  // Update project status
  await updateProject(project.id, { indexStatus: "running" });

  // Walk project files
  const allFiles = await walkProjectFiles(
    project.path,
    config.structural.skipPatterns,
    config.structural.maxFileSizeBytes,
  );

  logger.info(
    { totalFiles: allFiles.length },
    "File walk complete",
  );

  // Build set of all project-relative paths for dependency resolution
  const projectFileSet = new Set(allFiles.map((f) => f.path));

  // Determine which files need re-indexing
  let filesToIndex: FileEntry[];

  if (fullReindex) {
    filesToIndex = allFiles;
  } else {
    // Incremental: use git diff if we have a last indexed commit
    const headCommit = await getHeadCommit(project.path);

    if (project.lastIndexedCommit && headCommit && !fullReindex) {
      const changedPaths = await getChangedFiles(
        project.path,
        project.lastIndexedCommit,
        headCommit,
      );

      if (changedPaths.length > 0) {
        const changedSet = new Set(changedPaths);
        filesToIndex = allFiles.filter((f) => changedSet.has(f.path));
        logger.info(
          {
            changedFiles: changedPaths.length,
            filesToIndex: filesToIndex.length,
          },
          "Incremental indexing via git diff",
        );
      } else {
        // Fall back to hash-based check
        filesToIndex = [];
        for (const file of allFiles) {
          const needsReindex = await fileNeedsReindex(
            project.id,
            file.path,
            file.contentHash,
          );
          if (needsReindex) {
            filesToIndex.push(file);
          }
        }
      }
    } else {
      // No previous commit — check hashes
      filesToIndex = [];
      for (const file of allFiles) {
        const needsReindex = await fileNeedsReindex(
          project.id,
          file.path,
          file.contentHash,
        );
        if (needsReindex) {
          filesToIndex.push(file);
        }
      }
    }
  }

  logger.info(
    { filesToIndex: filesToIndex.length, totalFiles: allFiles.length },
    "Files selected for indexing",
  );

  // Create index run
  const indexRun = await createIndexRun(
    project.id,
    "structural",
    filesToIndex.length,
  );

  try {
    // Run structural analysis
    const structuralResults = await runStructuralLayer(
      filesToIndex,
      projectFileSet,
    );

    // Collect all edges for metrics computation
    const allEdges: DependencyEdge[] = structuralResults.flatMap(
      (r) => r.dependencies,
    );

    // Persist results
    await persistStructuralResults(project.id, structuralResults, allEdges);

    // Update progress
    await updateIndexRunProgress(indexRun.id, filesToIndex.length);

    // Compute totals
    const totalSymbols = structuralResults.reduce(
      (sum, r) => sum + r.symbols.length,
      0,
    );

    // Update project
    const headCommit = await getHeadCommit(project.path);
    await updateProject(project.id, {
      indexStatus: "completed",
      totalFiles: allFiles.length,
      totalSymbols,
      lastIndexedCommit: headCommit,
    });

    const durationMs = Date.now() - startTime;

    // Complete the run
    await completeIndexRun(indexRun.id, filesToIndex.length, durationMs);

    logger.info(
      {
        filesProcessed: filesToIndex.length,
        totalSymbols,
        durationMs,
      },
      "Structural layer complete",
    );

    return {
      layer: "structural",
      status: "completed",
      filesProcessed: filesToIndex.length,
      filesTotal: allFiles.length,
      durationMs,
      costUsd: 0,
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : String(err);

    await failIndexRun(
      indexRun.id,
      errorMessage,
      0,
      Date.now() - startTime,
    );

    await updateProject(project.id, { indexStatus: "failed" });

    throw err;
  }
}

// ---------------------------------------------------------------------------
// Documentation layer
// ---------------------------------------------------------------------------

/**
 * Execute the documentation parsing layer.
 *
 * Processes documentation files, config files, and inline comments.
 * Updates the `doc_content` column on prism_files for each processed file.
 * Assembles the project "intent" — a structured summary of what the
 * codebase is supposed to do.
 */
async function executeDocsLayer(context: IndexContext): Promise<LayerResult> {
  const { project, config } = context;
  const startTime = Date.now();

  logger.info({ projectId: project.id }, "Starting docs layer");

  // Walk project files (reuse same walker as structural layer)
  const allFiles = await walkProjectFiles(
    project.path,
    config.structural.skipPatterns,
    config.structural.maxFileSizeBytes,
  );

  const totalFiles = allFiles.length;

  // Create index run for docs layer
  const indexRun = await createIndexRun(project.id, "docs", totalFiles);

  try {
    let filesProcessed = 0;

    // 1. Parse documentation files (README, CHANGELOG, etc.)
    const readmeResults = parseDocFiles(allFiles);
    logger.info(
      { docFiles: readmeResults.length },
      "Parsed documentation files",
    );

    // Update doc_content for each documentation file
    for (const result of readmeResults) {
      await updateFileDocContent(project.id, result.filePath, result.summary);
      filesProcessed++;
    }

    // 2. Parse config files
    const configInfos = parseConfigFiles(allFiles);
    logger.info(
      { configFiles: configInfos.length },
      "Parsed config files",
    );

    // Update doc_content for each config file
    for (const info of configInfos) {
      const docContent = buildConfigDocContent(info);
      await updateFileDocContent(project.id, info.filePath, docContent);
      filesProcessed++;
    }

    // 3. Extract inline comments from source files
    const commentResults = extractCommentsFromFiles(allFiles);
    logger.info(
      { sourceFiles: commentResults.length },
      "Extracted inline comments",
    );

    // Update doc_content for source files that have meaningful comments
    for (const result of commentResults) {
      if (result.docContent.length > 0) {
        await updateFileDocContent(project.id, result.filePath, result.docContent);
        filesProcessed++;
      }
    }

    // 4. Build tech stack info
    const techStack = buildTechStack(configInfos, allFiles);

    // 5. Assemble the project intent
    const intent = assembleIntent(
      readmeResults,
      configInfos,
      commentResults,
      techStack,
    );

    const intentText = buildIntentDocContent(intent);
    logger.info(
      {
        description: intent.description,
        modules: intent.modules.length,
        languages: intent.techStack.languages,
      },
      "Assembled project intent",
    );

    // Store the intent as metadata on the project (via a special doc_content update)
    // We store it on a synthetic "__intent__" path to make it queryable
    // Actually, we'll log it but storing intent is done via the intent text on README files
    logger.debug({ intentLength: intentText.length }, "Intent assembled");

    // Update progress
    await updateIndexRunProgress(indexRun.id, filesProcessed);

    const durationMs = Date.now() - startTime;

    // Complete the run
    await completeIndexRun(indexRun.id, filesProcessed, durationMs);

    logger.info(
      {
        filesProcessed,
        totalFiles,
        docFiles: readmeResults.length,
        configFiles: configInfos.length,
        commentFiles: commentResults.length,
        durationMs,
      },
      "Docs layer complete",
    );

    return {
      layer: "docs",
      status: "completed",
      filesProcessed,
      filesTotal: totalFiles,
      durationMs,
      costUsd: 0,
    };
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : String(err);

    await failIndexRun(
      indexRun.id,
      errorMessage,
      0,
      Date.now() - startTime,
    );

    throw err;
  }
}
