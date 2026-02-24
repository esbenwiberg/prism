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

// Semantic layer imports
import {
  getSymbolsByProjectId,
  getProjectFiles,
  getExistingInputHashes,
  bulkInsertSummaries,
  bulkInsertEmbeddings,
  getSummariesByLevel,
} from "../db/queries/index.js";
import { chunkFileSymbols, filterSummarisableSymbols } from "./semantic/chunker.js";
import { summariseBatch, type SummariseInput } from "./semantic/summarizer.js";
import { createEmbedder } from "./semantic/embedder.js";

// Analysis layer imports
import { rollupFileSummaries, rollupModuleSummaries, rollupSystemSummary } from "./analysis/rollup.js";
import { runPatternDetection } from "./analysis/patterns.js";
import { runGapAnalysis } from "./analysis/gap-analysis.js";

// Purpose layer imports
import { runPurposeAnalysis } from "./purpose/index.js";

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
  "purpose",
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
    shouldCancel?: () => Promise<boolean>;
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
      config.purpose.budgetUsd +
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
    // Check for cancellation before each layer
    if (options.shouldCancel) {
      const cancelled = await options.shouldCancel();
      if (cancelled) {
        logger.info({ projectId: project.id, layer }, "Pipeline cancelled before layer");
        break;
      }
    }

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

        case "purpose":
          result = await executePurposeLayer(context);
          break;

        case "semantic":
          result = await executeSemanticLayer(context);
          break;

        case "analysis":
          result = await executeAnalysisLayer(context);
          break;

        // Blueprint is a separate command, not part of the index pipeline
        case "blueprint":
          logger.info({ layer }, "Blueprint layer is a separate command, skipping in pipeline");
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

    // Compute primary language from all files
    const langCounts = new Map<string, number>();
    for (const f of allFiles) {
      if (f.language) langCounts.set(f.language, (langCounts.get(f.language) ?? 0) + 1);
    }
    const primaryLanguage = langCounts.size > 0
      ? [...langCounts.entries()].sort((a, b) => b[1] - a[1])[0][0]
      : null;

    // Update project
    const headCommit = await getHeadCommit(project.path);
    await updateProject(project.id, {
      indexStatus: "completed",
      totalFiles: allFiles.length,
      totalSymbols,
      lastIndexedCommit: headCommit,
      ...(primaryLanguage ? { language: primaryLanguage } : {}),
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

// ---------------------------------------------------------------------------
// Purpose layer
// ---------------------------------------------------------------------------

/**
 * Execute the purpose analysis layer (Layer 2.5).
 *
 * Synthesises a structured App Purpose Document from available project signals
 * (docs intent, schema snippets, route snippets, exported type names, test
 * descriptions) and stores it as a `prism_summaries` row with level="purpose".
 */
async function executePurposeLayer(context: IndexContext): Promise<LayerResult> {
  const { project, config, budget } = context;
  const startTime = Date.now();

  if (!config.purpose.enabled) {
    logger.info({ projectId: project.id }, "Purpose layer disabled, skipping");
    return {
      layer: "purpose",
      status: "completed",
      filesProcessed: 0,
      filesTotal: 0,
      durationMs: Date.now() - startTime,
      costUsd: 0,
    };
  }

  logger.info({ projectId: project.id }, "Starting purpose layer");

  // Walk project files (reuse same walker)
  const allFiles = await walkProjectFiles(
    project.path,
    config.structural.skipPatterns,
    config.structural.maxFileSizeBytes,
  );

  // Re-assemble intent (same 5 calls as docs / analysis layers)
  const readmeResults = parseDocFiles(allFiles);
  const configInfos = parseConfigFiles(allFiles);
  const commentResults = extractCommentsFromFiles(allFiles);
  const techStack = buildTechStack(configInfos, allFiles);
  const intent = assembleIntent(readmeResults, configInfos, commentResults, techStack);
  const intentText = buildIntentDocContent(intent);

  // Extract schema snippets — files matching schema/migration/.sql patterns
  const schemaFiles = allFiles.filter((f) =>
    /schema\.ts|migration|\.sql/i.test(f.path),
  );
  const schemaSnippets = schemaFiles
    .slice(0, 3)
    .map((f) => `// ${f.path}\n${f.content.slice(0, 3000)}`)
    .join("\n\n---\n\n");

  // Extract route snippets — files whose content mentions router/controller patterns
  const routePattern = /router\.|app\.(get|post|put|delete|patch)|@(Get|Post|Put|Delete|Controller)/;
  const routeFiles = allFiles.filter((f) => routePattern.test(f.content));
  const routeSnippets = routeFiles
    .slice(0, 5)
    .map((f) => {
      const lines = f.content.split("\n").slice(0, 50).join("\n");
      return `// ${f.path}\n${lines}`;
    })
    .join("\n\n---\n\n");

  // Extract exported type names from DB
  const projectSymbols = await getSymbolsByProjectId(project.id);
  const exportedTypeNames = projectSymbols
    .filter(
      (s) =>
        s.exported &&
        (s.kind === "class" || s.kind === "interface" || s.kind === "type"),
    )
    .map((s) => (s.signature ? `${s.name}: ${s.signature}` : s.name))
    .slice(0, 100);

  // Extract test descriptions — describe/it/test string literals
  const testFiles = allFiles.filter((f) => /\.test\.[tj]s|\.spec\.[tj]s/.test(f.path));
  const testDescRe = /(?:describe|it|test)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  const testDescriptions: string[] = [];
  for (const f of testFiles) {
    let match: RegExpExecArray | null;
    while ((match = testDescRe.exec(f.content)) !== null) {
      testDescriptions.push(match[1]);
      if (testDescriptions.length >= 50) break;
    }
    if (testDescriptions.length >= 50) break;
  }

  const indexRun = await createIndexRun(project.id, "purpose", 1);

  try {
    const { content, costUsd } = await runPurposeAnalysis(
      project.id,
      project.name,
      intentText,
      schemaSnippets,
      routeSnippets,
      exportedTypeNames,
      testDescriptions,
      config.purpose,
      budget,
    );

    const durationMs = Date.now() - startTime;
    await completeIndexRun(indexRun.id, 1, durationMs, costUsd);

    logger.info(
      {
        projectId: project.id,
        contentLength: content.length,
        costUsd: costUsd.toFixed(4),
        durationMs,
      },
      "Purpose layer complete",
    );

    return {
      layer: "purpose",
      status: "completed",
      filesProcessed: 1,
      filesTotal: 1,
      durationMs,
      costUsd,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await failIndexRun(indexRun.id, errorMessage, 0, Date.now() - startTime);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Semantic layer
// ---------------------------------------------------------------------------

/**
 * Execute the semantic layer.
 *
 * For each function/class symbol in the project:
 * 1. Build a summarisation prompt
 * 2. Call Claude Haiku to generate a summary
 * 3. Embed the summary using the configured embedding provider
 * 4. Store summaries and embeddings in the database
 *
 * Respects budget limits and uses input hashing for incrementality.
 */
async function executeSemanticLayer(context: IndexContext): Promise<LayerResult> {
  const { project, config, budget } = context;
  const startTime = Date.now();

  if (!config.semantic.enabled) {
    logger.info({ projectId: project.id }, "Semantic layer disabled, skipping");
    return {
      layer: "semantic",
      status: "completed",
      filesProcessed: 0,
      filesTotal: 0,
      durationMs: Date.now() - startTime,
      costUsd: 0,
    };
  }

  logger.info({ projectId: project.id }, "Starting semantic layer");

  // Get all symbols and files for the project
  const projectSymbols = await getSymbolsByProjectId(project.id);
  const projectFiles = await getProjectFiles(project.id);

  // Build a file map: fileId -> { path, content }
  // Note: we'll need to re-read file content from disk since DB doesn't store it
  const filePathMap = new Map<number, string>();
  for (const f of projectFiles) {
    filePathMap.set(f.id, f.path);
  }

  // Group symbols by file
  const symbolsByFile = new Map<number, typeof projectSymbols>();
  for (const sym of projectSymbols) {
    const existing = symbolsByFile.get(sym.fileId) ?? [];
    existing.push(sym);
    symbolsByFile.set(sym.fileId, existing);
  }

  // Get existing input hashes for staleness detection
  const existingHashes = await getExistingInputHashes(project.id);

  // Collect all summarisation inputs
  const summariseInputs: SummariseInput[] = [];
  let totalSymbols = 0;

  for (const [fileId, fileSymbols] of symbolsByFile) {
    const filePath = filePathMap.get(fileId);
    if (!filePath) continue;

    // Read file content from disk
    const absPath = resolve(project.path, filePath);
    let fileContent: string;
    try {
      fileContent = await readFile(absPath, "utf-8");
    } catch {
      logger.debug({ filePath }, "Could not read file for semantic layer, skipping");
      continue;
    }

    // Detect language
    const language = detectLanguage(filePath);
    if (!language) continue;

    // Filter to summarisable symbols
    const eligible = filterSummarisableSymbols(
      fileSymbols.map((s) => ({
        kind: s.kind as import("../domain/types.js").SymbolKind,
        name: s.name,
        startLine: s.startLine ?? 1,
        endLine: s.endLine ?? 1,
        exported: s.exported,
        signature: s.signature,
        docstring: s.docstring,
        complexity: s.complexity ? Number(s.complexity) : null,
      })),
    );

    for (const sym of eligible) {
      summariseInputs.push({
        filePath,
        language,
        fileContent,
        symbol: sym,
        allSymbols: eligible,
      });
      totalSymbols++;
    }
  }

  logger.info(
    { totalSymbols, projectId: project.id },
    "Symbols collected for summarisation",
  );

  // Create index run
  const indexRun = await createIndexRun(project.id, "semantic", totalSymbols);

  try {
    // Process in batches
    const batchSize = config.indexer.batchSize;
    let symbolsProcessed = 0;
    let totalCostUsd = 0;

    for (let i = 0; i < summariseInputs.length; i += batchSize) {
      if (budget.exceeded) {
        logger.warn("Budget exceeded, stopping semantic layer");
        break;
      }

      const batch = summariseInputs.slice(i, i + batchSize);

      // Summarise batch
      const summaryResults = await summariseBatch(
        batch,
        config.semantic,
        budget,
        existingHashes,
      );

      // Store summaries in DB
      if (summaryResults.length > 0) {
        const summaryRows = await bulkInsertSummaries(
          summaryResults.map((s) => ({
            projectId: project.id,
            level: "function" as const,
            targetId: s.targetId,
            content: s.content,
            model: s.model,
            inputHash: s.inputHash,
            costUsd: s.costUsd.toFixed(4),
          })),
        );

        // Embed the summaries
        try {
          const embedder = createEmbedder(config.semantic);
          const textsToEmbed = summaryResults.map((s) => s.content);
          const vectors = await embedder.embed(textsToEmbed);

          // Store embeddings
          await bulkInsertEmbeddings(
            summaryRows.map((row, idx) => ({
              projectId: project.id,
              summaryId: row.id,
              embedding: vectors[idx],
              model: config.semantic.embeddingModel,
            })),
          );
        } catch (embedErr) {
          logger.warn(
            { error: embedErr instanceof Error ? embedErr.message : String(embedErr) },
            "Failed to embed summaries — summaries stored but embeddings skipped",
          );
        }

        totalCostUsd += summaryResults.reduce((sum, s) => sum + s.costUsd, 0);
      }

      symbolsProcessed += batch.length;
      await updateIndexRunProgress(indexRun.id, symbolsProcessed);
    }

    const durationMs = Date.now() - startTime;
    await completeIndexRun(indexRun.id, symbolsProcessed, durationMs, totalCostUsd);

    logger.info(
      {
        symbolsProcessed,
        totalSymbols,
        costUsd: totalCostUsd.toFixed(4),
        durationMs,
      },
      "Semantic layer complete",
    );

    return {
      layer: "semantic",
      status: "completed",
      filesProcessed: symbolsProcessed,
      filesTotal: totalSymbols,
      durationMs,
      costUsd: totalCostUsd,
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

// ---------------------------------------------------------------------------
// Analysis layer
// ---------------------------------------------------------------------------

/**
 * Execute the analysis layer (Layer 4).
 *
 * 1. Hierarchical summary rollup (file -> module -> system)
 * 2. Pattern detection (all detectors)
 * 3. Gap analysis (docs intent vs code reality)
 */
async function executeAnalysisLayer(context: IndexContext): Promise<LayerResult> {
  const { project, config, budget } = context;
  const startTime = Date.now();

  if (!config.analysis.enabled) {
    logger.info({ projectId: project.id }, "Analysis layer disabled, skipping");
    return {
      layer: "analysis",
      status: "completed",
      filesProcessed: 0,
      filesTotal: 0,
      durationMs: Date.now() - startTime,
      costUsd: 0,
    };
  }

  logger.info({ projectId: project.id }, "Starting analysis layer");

  // Count unique files from function summaries to set an accurate filesTotal upfront
  const functionSummariesEarly = await getSummariesByLevel(project.id, "function");
  const uniqueFileCount = new Set(
    functionSummariesEarly.map((s) => s.targetId.split(":").slice(0, -2).join(":")),
  ).size;

  const indexRun = await createIndexRun(project.id, "analysis", uniqueFileCount);
  let totalCostUsd = 0;

  try {
    // 1. Hierarchical summary rollup
    // Re-use the already-fetched function summaries
    const functionSummaries = functionSummariesEarly;
    logger.info(
      { count: functionSummaries.length },
      "Function summaries available for rollup",
    );

    // Build file path -> metadata map
    const projectFiles = await getProjectFiles(project.id);
    const projectSymbols = await getSymbolsByProjectId(project.id);
    const symbolCountByFile = new Map<number, number>();
    for (const s of projectSymbols) {
      symbolCountByFile.set(s.fileId, (symbolCountByFile.get(s.fileId) ?? 0) + 1);
    }

    const filePathMap = new Map<string, { language: string; symbolCount: number }>();
    for (const f of projectFiles) {
      filePathMap.set(f.path, {
        language: f.language ?? "unknown",
        symbolCount: symbolCountByFile.get(f.id) ?? 0,
      });
    }

    // File-level rollup — update progress after each file
    const fileSummaries = await rollupFileSummaries(
      project.id,
      functionSummaries,
      filePathMap,
      config.analysis,
      budget,
      (filesProcessed) => updateIndexRunProgress(indexRun.id, filesProcessed),
    );
    totalCostUsd += fileSummaries.reduce(
      (sum, s) => sum + (s.costUsd ? Number(s.costUsd) : 0),
      0,
    );

    // Module-level rollup
    const moduleSummaries = await rollupModuleSummaries(
      project.id,
      fileSummaries,
      config.analysis,
      budget,
    );
    totalCostUsd += moduleSummaries.reduce(
      (sum, s) => sum + (s.costUsd ? Number(s.costUsd) : 0),
      0,
    );

    // System-level rollup
    const systemSummary = await rollupSystemSummary(
      project.id,
      project.name,
      moduleSummaries,
      config.analysis,
      budget,
    );
    if (systemSummary?.costUsd) {
      totalCostUsd += Number(systemSummary.costUsd);
    }

    // 2. Pattern detection (runs all detectors)
    const { count: findingsCount } = await runPatternDetection(project.id);

    // 3. Gap analysis
    // Re-read files from disk to build doc intent
    const allFiles = await walkProjectFiles(
      project.path,
      config.structural.skipPatterns,
      config.structural.maxFileSizeBytes,
    );
    const readmeResults = parseDocFiles(allFiles);
    const configInfos = parseConfigFiles(allFiles);
    const commentResults = extractCommentsFromFiles(allFiles);
    const techStack = buildTechStack(configInfos, allFiles);
    const intent = assembleIntent(readmeResults, configInfos, commentResults, techStack);
    const intentText = buildIntentDocContent(intent);

    const gapFindings = await runGapAnalysis(
      project.id,
      project.name,
      intentText,
      systemSummary?.content ?? "",
      moduleSummaries,
      config.analysis,
      budget,
    );

    const durationMs = Date.now() - startTime;
    const filesProcessed = fileSummaries.length + moduleSummaries.length + (systemSummary ? 1 : 0);

    await completeIndexRun(indexRun.id, filesProcessed, durationMs, totalCostUsd);

    logger.info(
      {
        fileSummaries: fileSummaries.length,
        moduleSummaries: moduleSummaries.length,
        hasSystemSummary: !!systemSummary,
        findings: findingsCount,
        gaps: gapFindings.length,
        costUsd: totalCostUsd.toFixed(4),
        durationMs,
      },
      "Analysis layer complete",
    );

    return {
      layer: "analysis",
      status: "completed",
      filesProcessed,
      filesTotal: filesProcessed,
      durationMs,
      costUsd: totalCostUsd,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await failIndexRun(indexRun.id, errorMessage, 0, Date.now() - startTime);
    throw err;
  }
}
