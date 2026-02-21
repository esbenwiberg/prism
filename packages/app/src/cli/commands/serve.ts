/**
 * `prism serve` command — start the HTMX dashboard.
 */

import { Command } from "commander";
import { logger, initConfig } from "@prism/core";
import { startServer } from "../../dashboard/server.js";

export const serveCommand = new Command("serve")
  .description("Start the Prism dashboard (Express + HTMX)")
  .option("-p, --port <port>", "Port to listen on")
  .action(async (opts: { port?: string }) => {
    const config = initConfig();
    const port = opts.port ? parseInt(opts.port, 10) : config.dashboard.port;

    logger.info({ port }, "Starting dashboard");
    startServer(port);
  });
