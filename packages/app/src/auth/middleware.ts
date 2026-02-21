/**
 * Authentication middleware for the Prism dashboard.
 *
 * Checks the session for an authenticated user. If not authenticated,
 * redirects to /login.
 *
 * In development, auth can be bypassed with the SKIP_AUTH=true env var.
 */

import type { Request, Response, NextFunction } from "express";

/**
 * Middleware that requires authentication.
 *
 * If SKIP_AUTH=true is set, a mock dev user is injected into the session
 * and the request proceeds without checking credentials.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Development bypass
  if (process.env.SKIP_AUTH === "true") {
    if (!req.session.user) {
      req.session.user = {
        name: "Dev User",
        username: "dev@localhost",
      };
    }
    next();
    return;
  }

  // Check session for authenticated user
  if (req.session.user) {
    next();
    return;
  }

  // Not authenticated — redirect to login
  res.redirect("/login");
}
