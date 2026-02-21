/**
 * Database module barrel export.
 *
 * Re-exports schema tables, connection helpers, and migration runner.
 */

export * from "./schema.js";
export { getDb, closeDb, type Database } from "./connection.js";
export { runMigrations, type RunMigrationsOptions } from "./migrate.js";
export * from "./queries/index.js";
