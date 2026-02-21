/**
 * `prism serve` command — start the HTMX dashboard.
 *
 * This is a stub that will be implemented in a later milestone.
 */

import { Command } from "commander";
import { logger, initConfig, getConfig } from "@prism/core";

export const serveCommand = new Command("serve")
  .description("Start the Prism dashboard (Express + HTMX)")
  .option("-p, --port <port>", "Port to listen on")
  .action(async (opts: { port?: string }) => {
    const config = initConfig();
    const port = opts.port ? parseInt(opts.port, 10) : config.dashboard.port;

    logger.info({ port }, "Starting dashboard (stub)");

    // TODO: Implement Express + HTMX dashboard in a later milestone.
    console.log(
      `Dashboard not yet implemented. Would listen on port ${port}.`,
    );
  });
