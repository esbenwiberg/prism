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

/**
 * Return the shared database connection (lazy-initialised).
 *
 * The Pool is created on the first call and reused thereafter.
 * Reads `DATABASE_URL` from `process.env`.
 */
export function getDb(): Database {
  if (_db) return _db;

  const connectionString = process.env.DATABASE_URL;
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
