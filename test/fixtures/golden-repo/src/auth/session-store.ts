/**
 * Session store — manages user sessions backed by the database.
 * Known characteristics:
 *   - Imports: connection (1 dep, from db/)
 *   - Imported by: auth-service
 *   - Part of connection.ts blast radius chain (depth 1)
 */

import { query } from "../db/connection";

export interface StoredSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress: string;
  userAgent: string;
}

const SESSION_TTL_SECONDS = 86400; // 24 hours

export async function createSession(
  userId: string,
  token: string,
  ipAddress: string,
  userAgent: string
): Promise<StoredSession> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  const rows = await query<StoredSession>(
    `INSERT INTO sessions (user_id, token, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [userId, token, expiresAt.toISOString(), ipAddress, userAgent]
  );

  if (rows.length === 0) {
    throw new Error("Failed to create session");
  }

  return rows[0];
}

export async function findSessionByToken(token: string): Promise<StoredSession | null> {
  const rows = await query<StoredSession>(
    "SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()",
    [token]
  );
  return rows[0] ?? null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await query("DELETE FROM sessions WHERE id = $1", [sessionId]);
}

export async function deleteUserSessions(userId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    "DELETE FROM sessions WHERE user_id = $1 RETURNING id",
    [userId]
  );
  return rows.length;
}

export async function cleanExpiredSessions(): Promise<number> {
  const rows = await query<{ id: string }>(
    "DELETE FROM sessions WHERE expires_at < NOW() RETURNING id"
  );
  return rows.length;
}
