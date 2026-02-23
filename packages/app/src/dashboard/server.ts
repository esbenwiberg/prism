/**
 * Express server for the Prism dashboard.
 *
 * Sets up session, auth middleware, static file serving, and route
 * registration. Port defaults to 3100 (configurable via PrismConfig).
 */

import { join } from "node:path";
import express from "express";
import { logger } from "@prism/core";
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
