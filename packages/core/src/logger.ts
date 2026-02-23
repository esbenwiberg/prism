import pino from "pino";
import { logBuffer } from "./log-buffer.js";

/**
 * Pino logger singleton for @prism/core.
 *
 * Reads LOG_LEVEL from the environment (default: "info").
 * Writes to stdout and the in-memory log buffer (for the /logs dashboard page).
 */
export const logger: pino.Logger = pino(
  { name: "prism", level: process.env.LOG_LEVEL ?? "info" },
  pino.multistream([
    { stream: process.stdout },
    { stream: logBuffer.getStream() },
  ]),
);

export { logBuffer };
