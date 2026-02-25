/**
 * API key management queries.
 *
 * Keys are stored as SHA-256 hashes — the raw key is only available at
 * creation time and is never persisted. Each key has a 10-char prefix
 * (e.g. "prism_abcd") for UI identification without exposing the secret.
 */

import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../connection.js";
import { apiKeys } from "../schema.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ApiKeyRow = typeof apiKeys.$inferSelect;

export interface CreateApiKeyInput {
  name: string;
}

export interface CreateApiKeyResult {
  row: ApiKeyRow;
  /** The full raw key — shown once, never stored. */
  rawKey: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Generate a new API key, store its hash, and return the raw key.
 *
 * The raw key is `prism_<64 hex chars>` (32 random bytes).
 * Only the SHA-256 hash is persisted.
 */
export async function createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
  const db = getDb();
  const rawKey = `prism_${randomBytes(32).toString("hex")}`;
  const keyHash = sha256(rawKey);
  const keyPrefix = rawKey.slice(0, 10);

  const [row] = await db
    .insert(apiKeys)
    .values({ name: input.name, keyHash, keyPrefix })
    .returning();

  return { row, rawKey };
}

/**
 * Return all API keys ordered by creation date (newest first).
 */
export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const db = getDb();
  return db.select().from(apiKeys).orderBy(apiKeys.createdAt);
}

/**
 * Delete an API key by ID.
 */
export async function deleteApiKey(id: number): Promise<void> {
  const db = getDb();
  await db.delete(apiKeys).where(eq(apiKeys.id, id));
}

/**
 * Verify a raw Bearer token against the stored key hashes.
 *
 * If a match is found, `last_used_at` is updated and `true` is returned.
 * Returns `false` if no match.
 */
export async function verifyApiKey(rawToken: string): Promise<boolean> {
  const db = getDb();
  const hash = sha256(rawToken);
  const [row] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);
  if (!row) return false;

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id));

  return true;
}
