/**
 * `prism init` command — register a project for indexing.
 *
 * Resolves the given path (defaults to cwd), checks for an existing
 * registration, and inserts a new row in prism_projects.
 */

import { resolve } from "node:path";
import { Command } from "commander";
import {
  logger,
  initConfig,
  createProject,
  getProjectByPath,
} from "@prism/core";

export const initCommand = new Command("init")
  .description("Register a project for indexing")
  .argument("[path]", "Path to the project root", ".")
  .option("-n, --name <name>", "Project name (defaults to directory name)")
  .action(async (pathArg: string, opts: { name?: string }) => {
    const projectPath = resolve(pathArg);
    const projectName = opts.name ?? projectPath.split("/").pop() ?? "unnamed";

    // Ensure config is loaded.
    initConfig();

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
    console.log(`Project registered (id=${project.id}): ${project.path}`);
    logger.info({ id: project.id, path: project.path }, "Project registered");
  });
