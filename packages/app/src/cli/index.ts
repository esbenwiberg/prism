#!/usr/bin/env node

/**
 * Prism CLI — entry point.
 *
 * Registers all sub-commands and parses argv.
 */

import { Command } from "commander";
import { closeDb } from "@prism/core";

import { initCommand } from "./commands/init.js";
import { indexCommand } from "./commands/index-cmd.js";
import { statusCommand } from "./commands/status.js";
import { serveCommand } from "./commands/serve.js";
import { searchCommand } from "./commands/search.js";
import { analyzeCommand } from "./commands/analyze.js";
import { blueprintCommand } from "./commands/blueprint-cmd.js";
import { workerCommand } from "./commands/worker.js";

const program = new Command();

program
  .name("prism")
  .description("Prism — Codebase Analysis & Redesign Tool")
  .version("0.1.0");

program.addCommand(initCommand);
program.addCommand(indexCommand);
program.addCommand(statusCommand);
program.addCommand(serveCommand);
program.addCommand(searchCommand);
program.addCommand(analyzeCommand);
program.addCommand(blueprintCommand);
program.addCommand(workerCommand);

// Parse and execute.
program.parseAsync(process.argv).then(
  async () => {
    await closeDb();
  },
  async (err: unknown) => {
    console.error(err);
    await closeDb();
    process.exitCode = 1;
  },
);
