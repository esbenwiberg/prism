/**
 * `prism status` command — show indexing progress for a project or all projects.
 */

import { resolve } from "node:path";
import { Command } from "commander";
import {
  logger,
  initConfig,
  getProjectByPath,
  listProjects,
} from "@prism/core";

export const statusCommand = new Command("status")
  .description("Show indexing status for a project (or all projects)")
  .argument("[path]", "Path to a specific project")
  .option("-a, --all", "Show status for all registered projects")
  .action(async (pathArg: string | undefined, opts: { all?: boolean }) => {
    initConfig();

    if (opts.all || !pathArg) {
      const projects = await listProjects();
      if (projects.length === 0) {
        console.log("No projects registered. Run \"prism init\" first.");
        return;
      }

      console.log(`\n  Registered projects (${projects.length}):\n`);
      for (const p of projects) {
        console.log(
          `  [${p.id}] ${p.name}  status=${p.indexStatus}  path=${p.path}`,
        );
      }
      console.log();
      return;
    }

    const projectPath = resolve(pathArg);
    const project = await getProjectByPath(projectPath);
    if (!project) {
      console.error(
        `Project not registered: ${projectPath}\nRun "prism init" first.`,
      );
      process.exitCode = 1;
      return;
    }

    logger.info({ projectId: project.id }, "Showing project status");

    console.log(`\n  Project: ${project.name} (id=${project.id})`);
    console.log(`  Path:    ${project.path}`);
    console.log(`  Status:  ${project.indexStatus}`);
    console.log(`  Files:   ${project.totalFiles ?? "n/a"}`);
    console.log(`  Symbols: ${project.totalSymbols ?? "n/a"}`);
    console.log(`  Commit:  ${project.lastIndexedCommit ?? "n/a"}`);
    console.log();
  });
