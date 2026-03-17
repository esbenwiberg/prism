/**
 * API Documentation route.
 *
 * Route:
 *   GET /api-docs — render the API reference page
 */

import { Router } from "express";
import { apiDocsPage, apiDocsFragment } from "../views/index.js";

export const apiDocsRouter = Router();

apiDocsRouter.get("/api-docs", (req, res) => {
  const userName = req.session.user?.name ?? "User";

  if (req.headers["hx-request"]) {
    res.send(apiDocsFragment());
    return;
  }

  res.send(apiDocsPage(userName));
});
