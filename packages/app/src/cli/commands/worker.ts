/**
 * `prism worker` command — start the background job worker.
 *
 * Polls prism_jobs and executes indexing/blueprint jobs one at a time.
 * Shuts down gracefully on SIGTERM/SIGINT (finishes current job, then exits).
 */

import { Command } from "commander";
import { logger, initConfig, runMigrations } from "@prism/core";
import { startWorker } from "../../worker/index.js";

export const workerCommand = new Command("worker")
  .description("Start the background job worker (polls prism_jobs)")
  .action(async () => {
    await runMigrations();
    await initConfig();
    logger.info("Starting Prism worker process");
    console.log("  Prism worker starting — polling for jobs...\n");

    await startWorker();
  });
