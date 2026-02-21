/**
 * Credential CRUD operations.
 *
 * All functions use the shared database connection from `getDb()`.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../connection.js";
import { credentials } from "../schema.js";
import type { GitProvider } from "../../domain/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CredentialRow = typeof credentials.$inferSelect;

export interface CreateCredentialInput {
  label: string;
  provider: GitProvider;
  encryptedToken: string;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Create a new credential.
 */
export async function createCredential(
  input: CreateCredentialInput,
): Promise<CredentialRow> {
  const db = getDb();
  const [row] = await db
    .insert(credentials)
    .values({
      label: input.label,
      provider: input.provider,
      encryptedToken: input.encryptedToken,
    })
    .returning();
  return row;
}

/**
 * Get a credential by its numeric ID.
 */
export async function getCredential(
  id: number,
): Promise<CredentialRow | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(credentials)
    .where(eq(credentials.id, id));
  return row;
}

/**
 * List all credentials (tokens remain encrypted).
 */
export async function listCredentials(): Promise<CredentialRow[]> {
  const db = getDb();
  return db.select().from(credentials);
}

/**
 * Update a credential by ID.
 *
 * Only the provided fields are updated; `updatedAt` is always refreshed.
 */
export async function updateCredential(
  id: number,
  updates: Partial<Pick<CredentialRow, "label" | "provider" | "encryptedToken">>,
): Promise<CredentialRow | undefined> {
  const db = getDb();
  const [row] = await db
    .update(credentials)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(credentials.id, id))
    .returning();
  return row;
}

/**
 * Delete a credential by ID.
 *
 * Returns `true` if a row was deleted.
 */
export async function deleteCredential(id: number): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(credentials)
    .where(eq(credentials.id, id))
    .returning({ id: credentials.id });
  return deleted.length > 0;
}
