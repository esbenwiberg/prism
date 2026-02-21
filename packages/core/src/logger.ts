import pino from "pino";

/**
 * Pino logger singleton for @prism/core.
 *
 * Reads LOG_LEVEL from the environment (default: "info").
 * Pretty-printing can be enabled later via pino-pretty transport.
 */
export const logger: pino.Logger = pino({
  name: "prism",
  level: process.env.LOG_LEVEL ?? "info",
});
