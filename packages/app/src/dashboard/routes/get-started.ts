/**
 * Get Started guide route.
 *
 * Route:
 *   GET /get-started — render the onboarding guide page
 */

import { Router } from "express";
import { getStartedPage } from "../views/index.js";

export const getStartedRouter = Router();

getStartedRouter.get("/get-started", (req, res) => {
  const userName = req.session.user?.name ?? "User";
  res.send(getStartedPage(userName));
});
