/**
 * `prism init` command — register a project for indexing.
 *
 * Resolves the given path (defaults to cwd), checks for an existing
 * registration, and inserts a new row in prism_projects.
 *
 * After registration the command walks the project directory to count files
 * and detect the primary language, then updates the project row.
 */

import { resolve } from "node:path";
import { Command } from "commander";
import {
  logger,
  initConfig,
  getConfig,
  createProject,
  getProjectByPath,
  updateProject,
  walkProjectFiles,
} from "@prism/core";

/**
 * Map a SupportedLanguage identifier to a human-readable name.
 */
const LANGUAGE_DISPLAY_NAMES: Record<string, string> = {
  typescript: "TypeScript",
  tsx: "TypeScript (TSX)",
  javascript: "JavaScript",
  python: "Python",
  c_sharp: "C#",
};

export const initCommand = new Command("init")
  .description("Register a project for indexing")
  .argument("[path]", "Path to the project root", ".")
  .option("-n, --name <name>", "Project name (defaults to directory name)")
  .action(async (pathArg: string, opts: { name?: string }) => {
    const projectPath = resolve(pathArg);
    const projectName = opts.name ?? projectPath.split("/").pop() ?? "unnamed";

    // Ensure config is loaded.
    const config = initConfig();

    logger.info({ projectPath, projectName }, "Registering project");

    // Check if already registered.
    const existing = await getProjectByPath(projectPath);
    if (existing) {
      logger.warn(
        { id: existing.id, path: existing.path },
        "Project already registered",
      );
      console.log(`Project already registered (id=${existing.id}): ${existing.path}`);
      return;
    }

    const project = await createProject(projectName, projectPath);

    // Walk the project directory to count files and detect primary language.
    const files = await walkProjectFiles(
      projectPath,
      config.structural.skipPatterns,
      config.structural.maxFileSizeBytes,
    );

    const totalFiles = files.length;

    // Count files per language to determine primary language.
    const langCounts = new Map<string, number>();
    for (const file of files) {
      if (file.language) {
        langCounts.set(file.language, (langCounts.get(file.language) ?? 0) + 1);
      }
    }

    // Merge TypeScript and TSX counts for primary language detection.
    const tsCombined = (langCounts.get("typescript") ?? 0) + (langCounts.get("tsx") ?? 0);
    if (tsCombined > 0) {
      langCounts.set("typescript", tsCombined);
      langCounts.delete("tsx");
    }

    let primaryLanguage: string | null = null;
    let maxCount = 0;
    for (const [lang, count] of langCounts) {
      if (count > maxCount) {
        maxCount = count;
        primaryLanguage = lang;
      }
    }

    // Update the project row with file count and language.
    await updateProject(project.id, {
      totalFiles,
      language: primaryLanguage,
    });

    const displayLang = primaryLanguage
      ? LANGUAGE_DISPLAY_NAMES[primaryLanguage] ?? primaryLanguage
      : "unknown";

    console.log(
      `Project '${projectName}' registered (id: ${project.id}, ${totalFiles} files detected, primary language: ${displayLang})`,
    );
    logger.info(
      { id: project.id, path: project.path, totalFiles, language: primaryLanguage },
      "Project registered",
    );
  });
