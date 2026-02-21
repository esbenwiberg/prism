/**
 * Express session setup.
 *
 * Configures express-session with sensible defaults for the Prism dashboard.
 * In production, a persistent session store (e.g. connect-pg-simple) should
 * be added; the default MemoryStore is used here for the MVP.
 */

import session from "express-session";

/**
 * Session data stored for each authenticated user.
 */
declare module "express-session" {
  interface SessionData {
    user?: {
      name: string;
      username: string;
    };
  }
}

/**
 * Create the express-session middleware.
 *
 * Reads `SESSION_SECRET` from the environment (falls back to a dev-only
 * default).
 */
export function createSessionMiddleware(): ReturnType<typeof session> {
  const secret = process.env.SESSION_SECRET ?? "prism-dev-secret-change-me";

  return session({
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  });
}
