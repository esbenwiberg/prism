/**
 * `prism blueprint <project>` command — run Layer 5 hierarchical blueprint generation.
 *
 * Generates a phased redesign plan with milestones based on analysis results (Layer 4).
 * Requires that the project has been analysed first.
 */

import { resolve } from "node:path";
import { Command } from "commander";
import {
  logger,
  initConfig,
  getProject,
  getProjectByPath,
  createBudgetTracker,
} from "@prism/core";

import { generateHierarchicalBlueprint } from "../../blueprint/generator.js";

export const blueprintCommand = new Command("blueprint")
  .description("Generate a hierarchical redesign blueprint from analysis results")
  .argument("<project>", "Project ID (number) or path")
  .option("-g, --goal <text>", "Redesign goal (e.g. 'Productionize this PoC for enterprise deployment')")
  .option("-f, --focus <path>", "Focus on a specific subsystem path (e.g. 'src/api')")
  .action(
    async (projectArg: string, opts: { goal?: string; focus?: string }) => {
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
        { projectId: project.id, projectName: project.name, goal: opts.goal, focus: opts.focus },
        "Starting blueprint generation",
      );

      console.log(`\n  Generating hierarchical blueprint for: ${project.name} (id: ${project.id})`);
      if (opts.goal) {
        console.log(`  Goal: ${opts.goal}`);
      }
      if (opts.focus) {
        console.log(`  Focus: ${opts.focus}`);
      }
      console.log();

      const budget = createBudgetTracker(config.blueprint.budgetUsd);

      try {
        const result = await generateHierarchicalBlueprint(
          project.id,
          project.name,
          config.blueprint,
          budget,
          { goal: opts.goal, focus: opts.focus },
        );

        if (!result) {
          console.log(
            "  No blueprint generated. Ensure you have run 'prism analyze' first.\n",
          );
          return;
        }

        console.log(`  Blueprint: ${result.plan.title}`);
        console.log(`  Phases: ${result.phases.length}\n`);

        for (const { phase, milestones } of result.phases) {
          console.log(`    Phase ${phase.phaseOrder}: ${phase.title} (${milestones.length} milestones)`);
          for (const ms of milestones) {
            console.log(`      ${ms.milestoneOrder}. ${ms.title}`);
          }
          console.log();
        }

        const totalMilestones = result.phases.reduce((n, p) => n + p.milestones.length, 0);
        console.log(`  Total milestones: ${totalMilestones}`);
        console.log(`  Total cost: $${budget.spentUsd.toFixed(4)}`);
        console.log(
          "\n  Detail milestones per-phase in the dashboard: prism serve\n",
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
