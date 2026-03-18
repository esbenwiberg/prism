/**
 * Application entry point — wires everything together.
 * Known characteristics:
 *   - Imports: connection, routes, logger, middleware
 *   - This is the root of the application
 */

import { connect, disconnect } from "./db/connection";
import { buildRoutes, matchRoute } from "./api/routes";
import { authMiddleware, createRequestContext, corsMiddleware } from "./api/middleware";
import { info, error, setLogLevel } from "./utils/logger";

interface ServerConfig {
  port: number;
  dbHost: string;
  dbPort: number;
  dbName: string;
  dbUser: string;
  dbPassword: string;
  corsOrigins: string[];
  logLevel: "debug" | "info" | "warn" | "error";
}

async function start(config: ServerConfig): Promise<void> {
  setLogLevel(config.logLevel);
  info("Starting GoldenApp", { port: config.port });

  await connect({
    host: config.dbHost,
    port: config.dbPort,
    database: config.dbName,
    user: config.dbUser,
    password: config.dbPassword,
    maxPoolSize: 10,
  });

  const routes = buildRoutes();
  info("Routes registered", { count: routes.length });

  // Simulated request handling loop
  async function handleRequest(
    method: string,
    path: string,
    headers: Record<string, string>,
    body: Record<string, unknown>
  ): Promise<unknown> {
    const context = createRequestContext(Date.now().toString(36));
    const cors = corsMiddleware(headers["origin"] ?? "", config.corsOrigins);

    try {
      const authedContext = await authMiddleware(headers, context);
      const route = matchRoute(routes, method, path);

      if (!route) {
        return { status: 404, error: "Not found", headers: cors };
      }

      const result = await route.handler({ ...body, ...authedContext });
      return { ...cors, result };
    } catch (err) {
      error("Request failed", { method, path, error: String(err) });
      return { status: 500, error: "Internal server error", headers: cors };
    }
  }

  info("GoldenApp started successfully");
}

async function shutdown(): Promise<void> {
  info("Shutting down GoldenApp");
  await disconnect();
  info("Goodbye");
}

export { start, shutdown };
