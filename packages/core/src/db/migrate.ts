/**
 * Migration runner for Prism.
 *
 * Wraps drizzle-orm's `migrate()` with:
 * - A destructive-SQL guard that rejects `DROP TABLE` / `TRUNCATE` unless
 *   explicitly opted-in via `allowDestructive`.
 * - Logging via Pino.
 */

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
  /** Allow destructive statements (DROP TABLE, TRUNCATE, etc.). */
  allowDestructive?: boolean;
}

/**
 * Run pending Drizzle migrations.
 *
 * Reads migration SQL files from `migrationsFolder`, checks each for
 * destructive statements, then delegates to `drizzle-orm/node-postgres/migrator`.
 */
export async function runMigrations(
  options: RunMigrationsOptions = {},
): Promise<void> {
  const {
    migrationsFolder = "drizzle",
    allowDestructive = false,
  } = options;

  const config: MigrationConfig = {
    migrationsFolder,
    migrationsTable: "prism_migrations",
  };

  // --- Destructive-SQL guard ---
  if (!allowDestructive) {
    const migrationFiles = readMigrationFiles(config);
    for (const mf of migrationFiles) {
      for (const sql of mf.sql) {
        for (const pattern of DESTRUCTIVE_PATTERNS) {
          if (pattern.test(sql)) {
            throw new Error(
              `Destructive SQL detected in migration ${mf.folderMillis}: ` +
                `"${sql.slice(0, 120)}…". ` +
                `Pass allowDestructive: true to proceed.`,
            );
          }
        }
      }
    }
  }

  const db = getDb();
  logger.info({ migrationsFolder }, "Running database migrations");
  await drizzleMigrate(db, config);
  logger.info("Database migrations complete");
}
