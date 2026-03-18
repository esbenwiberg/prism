/**
 * API middleware — request processing pipeline.
 * Known characteristics:
 *   - Imports: auth-service (CIRCULAR DEPENDENCY)
 *   - Imported by: auth-service (completing the cycle)
 *   - Circular dep: middleware -> auth-service -> middleware
 */

import { refreshTokenIfNeeded } from "../auth/auth-service";

export interface RequestContext {
  userId?: string;
  roles: string[];
  requestId: string;
  startTime: number;
}

export function createRequestContext(requestId: string): RequestContext {
  return {
    roles: [],
    requestId,
    startTime: Date.now(),
  };
}

export async function authMiddleware(
  headers: Record<string, string>,
  context: RequestContext
): Promise<RequestContext> {
  const authHeader = headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }

  const token = authHeader.slice(7);
  const refreshed = await refreshTokenIfNeeded(token);

  return {
    ...context,
    userId: refreshed.userId,
    roles: refreshed.roles,
  };
}

export function corsMiddleware(
  origin: string,
  allowedOrigins: string[]
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    headers["Access-Control-Max-Age"] = "86400";
  }

  return headers;
}

export function rateLimitCheck(
  ip: string,
  requestCounts: Map<string, number>,
  maxRequests: number
): boolean {
  const current = requestCounts.get(ip) ?? 0;

  if (current >= maxRequests) {
    return false;
  }

  requestCounts.set(ip, current + 1);
  return true;
}
