/**
 * API key authentication middleware.
 *
 * Checks the Bearer token against DB-managed keys first, then falls back
 * to the PRISM_API_KEY environment variable.
 */

import type { Request, Response, NextFunction } from "express";
import { verifyApiKey, logger } from "@prism/core";

export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  // 1. Check DB-managed keys (hash-based lookup, updates last_used_at)
  try {
    const validInDb = await verifyApiKey(token);
    if (validInDb) {
      next();
      return;
    }
  } catch (err) {
    logger.warn({ err }, "verifyApiKey DB lookup failed, falling back to env var");
  }

  // 2. Fallback: compare against PRISM_API_KEY env var (backward compat)
  const envKey = process.env.PRISM_API_KEY;
  if (envKey && token === envKey) {
    next();
    return;
  }

  res.status(401).json({ error: "Invalid API key" });
}
