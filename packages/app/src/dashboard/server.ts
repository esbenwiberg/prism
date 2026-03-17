/**
 * Express server for the Prism dashboard.
 *
 * Sets up session, auth middleware, static file serving, and route
 * registration. Port defaults to 3100 (configurable via PrismConfig).
 */

import { join } from "node:path";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import cors from "cors";
import { getConfig, logger } from "@prism/core";
import { createSessionMiddleware } from "../auth/session.js";
import { requireAuth } from "../auth/middleware.js";
import { getAuthUrl, handleCallback } from "../auth/entra.js";
import { overviewRouter } from "./routes/overview.js";
import { projectRouter } from "./routes/project.js";
import { filesRouter } from "./routes/files.js";
import { findingsRouter } from "./routes/findings.js";
import { searchRouter } from "./routes/search.js";
import { blueprintsRouter } from "./routes/blueprints.js";
import { graphRouter } from "./routes/graph.js";
import { modulesRouter } from "./routes/modules.js";
import { credentialsRouter } from "./routes/credentials.js";
import { exportRouter } from "./routes/export.js";
import logsRouter from "./routes/logs.js";
import healthRouter from "./routes/health.js";
import settingsRouter from "./routes/settings.js";
import promptsRouter from "./routes/prompts.js";
import { symbolsRouter } from "./routes/symbols.js";
import { purposeRouter } from "./routes/purpose.js";
import { summariesRouter } from "./routes/summaries.js";
import { pipelineRouter } from "./routes/pipeline.js";
import { reindexRunsRouter } from "./routes/reindex-runs.js";
import { apiRouter } from "./routes/api.js";
import { mcpRouter } from "./routes/mcp.js";
import { apiKeysRouter } from "./routes/api-keys.js";
import { getStartedRouter } from "./routes/get-started.js";
import { historyRouter } from "./routes/history.js";
import { contextExplorerRouter } from "./routes/context-explorer.js";

/**
 * Create and configure the Express application.
 */
export function createApp(): express.Express {
  const app = express();

  // Trust the reverse proxy (Azure Container Apps ingress) so that
  // req.protocol and req.hostname reflect the external URL, not the
  // internal container-to-ingress hop.
  app.set("trust proxy", true);

  // ---------------------------------------------------------------------------
  // Middleware
  // ---------------------------------------------------------------------------

  // Session
  app.use(createSessionMiddleware());

  // Body parsing for HTML form submissions (POST)
  app.use(express.urlencoded({ extended: false }));

  // JSON body parsing for API routes
  app.use(express.json());

  // CORS — allow configured origins for API routes.
  // When no origins are configured, CORS is disabled (same-origin only).
  app.use(
    cors({
      origin: (origin, callback) => {
        let allowed: string[];
        try {
          allowed = getConfig().dashboard.corsOrigins;
        } catch {
          allowed = [];
        }

        // No origins configured → block cross-origin requests
        if (allowed.length === 0) {
          callback(null, false);
          return;
        }

        // Wildcard allows everything
        if (allowed.includes("*")) {
          callback(null, true);
          return;
        }

        // Allow requests with no origin (server-to-server, curl, etc.)
        if (!origin || allowed.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(null, false);
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  // Static files (htmx-ext.js etc.)
  // __dirname is available in CJS output; points to the compiled dist directory.
  // The public/ directory is alongside the compiled server.js.
  app.use("/public", express.static(join(__dirname, "public")));

  // ---------------------------------------------------------------------------
  // Auth routes (unauthenticated)
  // ---------------------------------------------------------------------------

  app.get("/login", async (req, res) => {
    // If SKIP_AUTH is set, redirect straight to /
    if (process.env.SKIP_AUTH === "true") {
      res.redirect("/");
      return;
    }

    try {
      const origin = `${req.protocol}://${req.hostname}`;
      const url = await getAuthUrl(origin);
      res.redirect(url);
    } catch (err) {
      logger.error({ err }, "Failed to generate auth URL");
      res.status(500).send("Authentication configuration error. Check AZURE_* environment variables.");
    }
  });

  app.get("/auth/callback", async (req, res) => {
    const code = req.query.code;
    if (typeof code !== "string") {
      res.status(400).send("Missing authorization code");
      return;
    }

    try {
      const origin = `${req.protocol}://${req.hostname}`;
      const user = await handleCallback(code, origin);
      req.session.user = user;
      res.redirect("/");
    } catch (err) {
      logger.error({ err }, "Auth callback failed");
      res.status(500).send("Authentication failed");
    }
  });

  app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        logger.error({ err }, "Session destroy failed");
      }
      res.redirect("/login");
    });
  });

  // ---------------------------------------------------------------------------
  // Machine-to-machine API routes (Bearer token auth, not session-based)
  // ---------------------------------------------------------------------------

  app.use(apiRouter);
  app.use(mcpRouter);

  // ---------------------------------------------------------------------------
  // Protected routes
  // ---------------------------------------------------------------------------

  app.use(requireAuth);

  app.use(overviewRouter);
  app.use(projectRouter);
  app.use(filesRouter);
  app.use(findingsRouter);
  app.use(searchRouter);
  app.use(exportRouter); // Must be before blueprintsRouter (export path matches :planId param)
  app.use(blueprintsRouter);
  app.use(graphRouter);
  app.use(modulesRouter);
  app.use(credentialsRouter);
  app.use(logsRouter);
  app.use(healthRouter);
  app.use(settingsRouter);
  app.use(promptsRouter);
  app.use(symbolsRouter);
  app.use(purposeRouter);
  app.use(summariesRouter);
  app.use(pipelineRouter);
  app.use(reindexRunsRouter);
  app.use(apiKeysRouter);
  app.use(historyRouter);
  app.use(contextExplorerRouter);
  app.use(getStartedRouter);

  // ---------------------------------------------------------------------------
  // Global error handler — catch-all for unhandled route errors
  // ---------------------------------------------------------------------------

  app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err, method: req.method, url: req.url }, "Unhandled route error");

    // Return JSON for API/MCP routes, HTML for dashboard routes
    if (req.path.startsWith("/api/") || req.path === "/mcp") {
      res.status(500).json({ error: "Internal server error" });
    } else {
      res.status(500).send("Internal server error");
    }
  });

  return app;
}

/**
 * Start the Express server.
 *
 * @param port — Port to listen on (default: 3100).
 */
export function startServer(port: number = 3100): void {
  const app = createApp();

  app.listen(port, () => {
    logger.info({ port }, "Prism dashboard listening");
    console.log(`Prism dashboard: http://localhost:${port}`);
  });
}
