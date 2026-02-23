import { eq } from "drizzle-orm";
import { getDb } from "../connection.js";
import { globalSettings } from "../schema.js";

/**
 * Read the stored global settings object from the DB.
 * Returns an empty object if no row exists yet.
 */
export async function getDbSettings(): Promise<Record<string, unknown>> {
  const db = getDb();
  const rows = await db.select().from(globalSettings).where(eq(globalSettings.id, 1));
  return (rows[0]?.settings as Record<string, unknown>) ?? {};
}

/**
 * Upsert the global settings object in the DB.
 */
export async function saveDbSettings(data: Record<string, unknown>): Promise<void> {
  const db = getDb();
  await db
    .insert(globalSettings)
    .values({ id: 1, settings: data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: globalSettings.id,
      set: { settings: data, updatedAt: new Date() },
    });
}
