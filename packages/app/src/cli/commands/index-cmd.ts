/**
 * `prism index` command — run the indexing pipeline on a project.
 */

import { resolve } from "node:path";
import { Command } from "commander";
import {
  logger,
  initConfig,
  getProjectByPath,
  runPipeline,
} from "@prism/core";
import type { LayerName } from "@prism/core";

export const indexCommand = new Command("index")
  .description("Run the indexing pipeline on a project")
  .argument("[path]", "Path to the project root", ".")
  .option(
    "-l, --layer <layer>",
    "Run only a specific layer (structural, docs, semantic, analysis, blueprint)",
  )
  .option("--full", "Force a full re-index (ignore incremental state)")
  .action(
    async (
      pathArg: string,
      opts: { layer?: LayerName; full?: boolean },
    ) => {
      const projectPath = resolve(pathArg);
      initConfig();

      const project = await getProjectByPath(projectPath);
      if (!project) {
        console.error(
          `Project not registered: ${projectPath}\nRun "prism init" first.`,
        );
        process.exitCode = 1;
        return;
      }

      logger.info(
        { projectId: project.id, layer: opts.layer, full: opts.full },
        "Starting indexing pipeline",
      );

      try {
        const results = await runPipeline(project, {
          layers: opts.layer ? [opts.layer] : undefined,
          fullReindex: opts.full,
        });

        // Print summary
        for (const result of results) {
          const statusIcon =
            result.status === "completed"
              ? "done"
              : result.status === "failed"
                ? "FAILED"
                : "skipped";

          console.log(
            `  ${result.layer}: ${statusIcon} — ${result.filesProcessed}/${result.filesTotal} files (${result.durationMs}ms)`,
          );

          if (result.error) {
            console.error(`    Error: ${result.error}`);
          }
        }

        const anyFailed = results.some((r) => r.status === "failed");
        if (anyFailed) {
          process.exitCode = 1;
        }
      } catch (err) {
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          "Pipeline failed",
        );
        console.error(
          `Pipeline error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    },
  );
