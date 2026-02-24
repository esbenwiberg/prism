/**
 * Database connection singleton.
 *
 * Uses `pg` Pool + drizzle-orm with schema. Reads `DATABASE_URL` from the
 * environment.
 */

import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";
import { logger } from "../logger.js";

const { Pool } = pg;

export type Database = NodePgDatabase<typeof schema>;

let _pool: pg.Pool | undefined;
let _db: Database | undefined;
let _activeConnectionString: string | undefined;

/**
 * Override the connection string used by `getDb()` when `DATABASE_URL` should
 * not be read from the environment (e.g. when Prism is used as a library
 * inside another process that owns `DATABASE_URL`).
 *
 * Call with `undefined` to clear the override and fall back to `DATABASE_URL`.
 */
export function setActiveConnectionString(connStr: string | undefined): void {
  if (connStr !== _activeConnectionString) {
    // Connection string changed — tear down the existing pool so the next
    // getDb() call creates a fresh one with the new string.
    if (_pool) {
      _pool.end().catch(() => {});
      _pool = undefined;
      _db = undefined;
    }
    _activeConnectionString = connStr;
  }
}

/**
 * Return the shared database connection (lazy-initialised).
 *
 * The Pool is created on the first call and reused thereafter.
 * Uses (in order): explicit `setActiveConnectionString()` override,
 * then `DATABASE_URL` from `process.env`.
 */
export function getDb(): Database {
  if (_db) return _db;

  const connectionString = _activeConnectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL environment variable is required but not set.",
    );
  }

  _pool = new Pool({ connectionString });
  _db = drizzle(_pool, { schema });

  logger.info("Database connection pool initialised");
  return _db;
}

/**
 * Gracefully close the connection pool.
 *
 * Safe to call multiple times; subsequent calls are no-ops.
 */
export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    logger.info("Database connection pool closed");
    _pool = undefined;
    _db = undefined;
  }
}
