/**
 * `prism status` command — show indexing progress for a project or all projects.
 *
 * When viewing a single project, also displays per-layer index run
 * information (status, progress, cost, duration) and total cost.
 */

import { resolve } from "node:path";
import { Command } from "commander";
import {
  logger,
  initConfig,
  getProjectByPath,
  listProjects,
  getIndexRunsByProjectId,
  type IndexRunRow,
} from "@prism/core";

/**
 * Format a duration in milliseconds to a human-readable string.
 */
function formatDuration(ms: number | null): string {
  if (ms == null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Format a cost value to a dollar string.
 */
function formatCost(cost: string | null): string {
  if (cost == null) return "-";
  const n = Number(cost);
  if (n === 0) return "$0.00";
  return `$${n.toFixed(4)}`;
}

/**
 * Pad or truncate a string to a fixed width.
 */
function pad(s: string, width: number): string {
  return s.length >= width ? s.slice(0, width) : s + " ".repeat(width - s.length);
}

/**
 * Print a formatted table of per-layer index runs.
 */
function printRunsTable(runs: IndexRunRow[]): void {
  const header = `  ${pad("Layer", 12)} ${pad("Status", 12)} ${pad("Progress", 16)} ${pad("Cost", 12)} ${pad("Duration", 12)}`;
  console.log(header);
  console.log(`  ${"-".repeat(header.length - 2)}`);

  for (const run of runs) {
    const progress =
      run.filesProcessed != null && run.filesTotal != null
        ? `${run.filesProcessed}/${run.filesTotal}`
        : "-";

    console.log(
      `  ${pad(run.layer, 12)} ${pad(run.status, 12)} ${pad(progress, 16)} ${pad(formatCost(run.costUsd), 12)} ${pad(formatDuration(run.durationMs), 12)}`,
    );
  }
}

export const statusCommand = new Command("status")
  .description("Show indexing status for a project (or all projects)")
  .argument("[path]", "Path to a specific project")
  .option("-a, --all", "Show status for all registered projects")
  .action(async (pathArg: string | undefined, opts: { all?: boolean }) => {
    await initConfig();

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

    // Show per-layer index run information.
    const runs = await getIndexRunsByProjectId(project.id);
    if (runs.length > 0) {
      console.log(`\n  Index runs (${runs.length}):\n`);
      printRunsTable(runs);

      // Compute and display total cost.
      const totalCost = runs.reduce(
        (sum, r) => sum + (r.costUsd != null ? Number(r.costUsd) : 0),
        0,
      );
      console.log(`\n  Total cost: $${totalCost.toFixed(4)}`);
    } else {
      console.log(`\n  No index runs yet. Run "prism index" to start indexing.`);
    }

    console.log();
  });
