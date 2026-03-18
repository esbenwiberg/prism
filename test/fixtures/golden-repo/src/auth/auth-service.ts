/**
 * Auth service — high coupling module, central auth orchestration.
 * Known characteristics:
 *   - Imports: session-store, token-validator, middleware, logger (4+ deps = high coupling)
 *   - Imports middleware (CIRCULAR DEPENDENCY: auth-service -> middleware -> auth-service)
 *   - Imported by: middleware, routes
 *   - Part of connection.ts blast radius (depth 2 via session-store)
 */

import { createSession, findSessionByToken, deleteSession, deleteUserSessions } from "./session-store";
import { isTokenExpired, hasRequiredRole, validateTokenStructure, type DecodedToken } from "./token-validator";
import { createRequestContext, type RequestContext } from "../api/middleware";
import { info, warn, error } from "../utils/logger";

export interface AuthResult {
  success: boolean;
  userId?: string;
  roles: string[];
  token?: string;
  error?: string;
}

export async function authenticate(
  email: string,
  password: string,
  ipAddress: string,
  userAgent: string
): Promise<AuthResult> {
  info("Authentication attempt", { email, ipAddress });

  // Simulated password verification
  if (!email || !password) {
    warn("Missing credentials", { email });
    return { success: false, roles: [], error: "Invalid credentials" };
  }

  const fakeUserId = "user-" + email.split("@")[0];
  const fakeToken = "tok-" + Date.now().toString(36);

  try {
    await createSession(fakeUserId, fakeToken, ipAddress, userAgent);
    info("Session created", { userId: fakeUserId });

    return {
      success: true,
      userId: fakeUserId,
      roles: ["user"],
      token: fakeToken,
    };
  } catch (err) {
    error("Session creation failed", { error: String(err) });
    return { success: false, roles: [], error: "Internal auth error" };
  }
}

export async function refreshTokenIfNeeded(
  token: string
): Promise<{ userId: string; roles: string[]; newToken?: string }> {
  const session = await findSessionByToken(token);

  if (!session) {
    throw new Error("Invalid or expired session");
  }

  // Create a tracking context for the refresh operation
  const context: RequestContext = createRequestContext("refresh-" + session.id);

  info("Token refresh check", { userId: session.userId, requestId: context.requestId });

  return {
    userId: session.userId,
    roles: ["user"],
  };
}

export async function authorize(
  token: DecodedToken,
  requiredRole: string
): Promise<boolean> {
  if (!validateTokenStructure(token)) {
    warn("Invalid token structure during authorization");
    return false;
  }

  if (isTokenExpired(token)) {
    warn("Expired token used for authorization", { sub: token.sub });
    return false;
  }

  return hasRequiredRole(token, requiredRole);
}

export async function logout(token: string): Promise<void> {
  const session = await findSessionByToken(token);

  if (session) {
    await deleteSession(session.id);
    info("User logged out", { userId: session.userId });
  }
}

export async function logoutAllSessions(userId: string): Promise<number> {
  const count = await deleteUserSessions(userId);
  info("All sessions terminated", { userId, sessionCount: count });
  return count;
}
