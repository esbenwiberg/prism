/**
 * `prism serve` command — start the HTMX dashboard.
 */

import { Command } from "commander";
import { logger, initConfig, runMigrations } from "@prism/core";
import { startServer } from "../../dashboard/server.js";
import { startWorker } from "../../worker/index.js";

export const serveCommand = new Command("serve")
  .description("Start the Prism dashboard (Express + HTMX)")
  .option("-p, --port <port>", "Port to listen on")
  .action(async (opts: { port?: string }) => {
    await runMigrations();
    const config = await initConfig();
    const port = opts.port ? parseInt(opts.port, 10) : config.dashboard.port;

    logger.info({ port }, "Starting dashboard");
    startServer(port);

    logger.info("Starting embedded worker");
    await startWorker();
  });
