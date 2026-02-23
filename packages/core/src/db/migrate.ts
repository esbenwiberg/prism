/**
 * Migration runner for Prism.
 *
 * Wraps drizzle-orm's `migrate()` with:
 * - A destructive-SQL guard that rejects `DROP TABLE` / `TRUNCATE` in
 *   pending (not-yet-applied) migrations.
 * - Logging via Pino.
 */

import { sql } from "drizzle-orm";
import { readMigrationFiles, type MigrationConfig } from "drizzle-orm/migrator";
import { migrate as drizzleMigrate } from "drizzle-orm/node-postgres/migrator";
import { logger } from "../logger.js";
import { getDb } from "./connection.js";

/** Patterns considered destructive (case-insensitive). */
const DESTRUCTIVE_PATTERNS = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+SCHEMA\b/i,
  /\bTRUNCATE\b/i,
];

export interface RunMigrationsOptions {
  /** Path to the migrations folder (default: `drizzle`). */
  migrationsFolder?: string;
}

/**
 * Run pending Drizzle migrations.
 *
 * Reads migration SQL files from `migrationsFolder`, checks each
 * *pending* (not-yet-applied) migration for destructive statements,
 * then delegates to `drizzle-orm/node-postgres/migrator`.
 *
 * Already-applied migrations are skipped by the guard — they ran
 * intentionally and checking them again would be a false positive.
 */
export async function runMigrations(
  options: RunMigrationsOptions = {},
): Promise<void> {
  const { migrationsFolder = "drizzle" } = options;

  const config: MigrationConfig = {
    migrationsFolder,
    migrationsTable: "prism_migrations",
  };

  const db = getDb();

  // --- Destructive-SQL guard (pending migrations only) ---
  const migrationFiles = readMigrationFiles(config);

  // Fetch hashes of already-applied migrations so we can skip them.
  let appliedHashes = new Set<string>();
  try {
    const result = await db.execute(
      sql`SELECT hash FROM prism_migrations`,
    );
    appliedHashes = new Set(result.rows.map((r) => String((r as Record<string, unknown>).hash)));
  } catch {
    // Table doesn't exist yet (first run) — all migrations are pending.
  }

  for (const mf of migrationFiles) {
    if (appliedHashes.has(mf.hash)) continue;
    for (const statement of mf.sql) {
      for (const pattern of DESTRUCTIVE_PATTERNS) {
        if (pattern.test(statement)) {
          throw new Error(
            `Destructive SQL detected in pending migration ${mf.folderMillis}: ` +
              `"${statement.slice(0, 120)}…". ` +
              `Remove the statement or apply the migration manually.`,
          );
        }
      }
    }
  }

  logger.info({ migrationsFolder }, "Running database migrations");
  await drizzleMigrate(db, config);
  logger.info("Database migrations complete");
}
