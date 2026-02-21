/**
 * `prism blueprint <project>` command — run Layer 5 blueprint generation.
 *
 * Generates redesign proposals based on analysis results (Layer 4).
 * Requires that the project has been analysed first.
 */

import { resolve } from "node:path";
import { Command } from "commander";
import {
  logger,
  initConfig,
  getConfig,
  getProject,
  getProjectByPath,
  createBudgetTracker,
} from "@prism/core";

import { generateBlueprints } from "../../blueprint/generator.js";

export const blueprintCommand = new Command("blueprint")
  .description("Generate redesign blueprints from analysis results")
  .argument("<project>", "Project ID (number) or path")
  .action(
    async (projectArg: string) => {
      const config = initConfig();

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
        "Starting blueprint generation",
      );

      console.log(`\n  Generating blueprints for: ${project.name} (id: ${project.id})\n`);

      const budget = createBudgetTracker(config.blueprint.budgetUsd);

      try {
        const blueprints = await generateBlueprints(
          project.id,
          project.name,
          config.blueprint,
          budget,
        );

        if (blueprints.length === 0) {
          console.log(
            "  No blueprints generated. Ensure you have run 'prism analyze' first.\n",
          );
          return;
        }

        console.log(`  Generated ${blueprints.length} blueprint(s):\n`);

        for (const bp of blueprints) {
          console.log(`    - ${bp.title}`);
          if (bp.subsystem) {
            console.log(`      Subsystem: ${bp.subsystem}`);
          }
          if (bp.summary) {
            console.log(`      ${bp.summary}`);
          }
        }

        console.log(
          `\n  Total cost: $${budget.spentUsd.toFixed(4)}`,
        );
        console.log(
          "\n  View full details in the dashboard: prism serve\n",
        );
      } catch (err) {
        logger.error(
          { error: err instanceof Error ? err.message : String(err) },
          "Blueprint generation failed",
        );
        console.error(
          `Blueprint error: ${err instanceof Error ? err.message : String(err)}`,
        );
        process.exitCode = 1;
      }
    },
  );
