/**
 * `prism index` command — run the indexing pipeline on a project.
 *
 * This is a stub that will be implemented in a later milestone.
 */

import { resolve } from "node:path";
import { Command } from "commander";
import { logger, initConfig, getProjectByPath } from "@prism/core";
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
        "Starting indexing pipeline (stub)",
      );

      // TODO: Implement pipeline orchestration in a later milestone.
      console.log(
        `Indexing pipeline not yet implemented. Project: ${project.name} (id=${project.id})`,
      );
    },
  );
