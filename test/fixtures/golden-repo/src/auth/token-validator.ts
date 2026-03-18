/**
 * Token validator — pure functions, no dependencies.
 * Known characteristics:
 *   - Zero imports
 *   - Pure functions only
 *   - Low cyclomatic complexity (~2-3)
 *   - High cohesion: all functions relate to token validation
 */

export interface DecodedToken {
  sub: string;
  email: string;
  iat: number;
  exp: number;
  roles: string[];
}

export function isTokenExpired(token: DecodedToken): boolean {
  const now = Math.floor(Date.now() / 1000);
  return token.exp < now;
}

export function hasRequiredRole(token: DecodedToken, requiredRole: string): boolean {
  return token.roles.includes(requiredRole);
}

export function isTokenIssuedBefore(token: DecodedToken, timestamp: number): boolean {
  return token.iat < timestamp;
}

export function extractSubject(token: DecodedToken): string {
  return token.sub;
}

export function validateTokenStructure(payload: unknown): payload is DecodedToken {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }

  const obj = payload as Record<string, unknown>;

  return (
    typeof obj.sub === "string" &&
    typeof obj.email === "string" &&
    typeof obj.iat === "number" &&
    typeof obj.exp === "number" &&
    Array.isArray(obj.roles) &&
    obj.roles.every((r: unknown) => typeof r === "string")
  );
}
