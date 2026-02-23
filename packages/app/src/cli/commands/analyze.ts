/**
 * `prism analyze <project>` command — run Layer 4 analysis.
 *
 * Performs hierarchical summary rollup, pattern detection, and gap analysis.
 * Requires that the project has been indexed (layers 1-3) first.
 */

import { resolve } from "node:path";
import { Command } from "commander";
import {
  logger,
  initConfig,
  getProject,
  getProjectByPath,
  runPipeline,
} from "@prism/core";

export const analyzeCommand = new Command("analyze")
  .description("Run Layer 4 analysis (summary rollup, pattern detection, gap analysis)")
  .argument("<project>", "Project ID (number) or path")
  .option("--full", "Force a full re-analysis (ignore incremental state)")
  .action(
    async (
      projectArg: string,
      opts: { full?: boolean },
    ) => {
      const config = await initConfig();

      // Resolve project: by ID or by path
      let project;
      const projectId = parseInt(projectArg, 10);
      if (!isNaN(projectId)) {
        project = await getProject(projectId);
      } else {
        project = await getProjectByPath(resolve(projectArg));
      }

      if (!project) {
        console.error(
          `Project not found: ${projectArg}\nRun "prism init" and "prism index" first.`,
        );
        process.exitCode = 1;
        return;
      }

      logger.info(
        { projectId: project.id, projectName: project.name },
        "Starting analysis",
      );

      console.log(`\n  Analysing project: ${project.name} (id: ${project.id})\n`);

      try {
        const results = await runPipeline(project, {
          layers: ["analysis"],
          fullReindex: opts.full,
        });

        for (const result of results) {
          const statusIcon =
            result.status === "completed"
              ? "done"
              : result.status === "failed"
                ? "FAILED"
                : "skipped";

          console.log(
            `  ${result.layer}: ${statusIcon} — ${result.filesProcessed} summaries generated (${result.durationMs}ms, $${result.costUsd.toFixed(4)})`,
          );

          if (result.error) {
            console.error(`    Error: ${result.error}`);
          }
        }

        const anyFailed = results.some((r) => r.status === "failed");
        if (anyFailed) {
          process.exitCode = 1;
        } else {
          console.log("\n  Analysis complete. Run 'prism blueprint' to generate redesign proposals.\n");
        }
      } catch (err) {
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          "Analysis failed",
        );
        console.error(
          `Analysis error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    },
  );
