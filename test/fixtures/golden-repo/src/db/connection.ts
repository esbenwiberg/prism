/**
 * Database connection — core infrastructure with many reverse dependencies.
 * Known characteristics:
 *   - Imports: logger (1 dep)
 *   - Imported by: user-repository, session-store (depth 1)
 *   - Transitively depended on by: auth-service, routes (depth 2)
 *   - High blast radius when modified
 */

import { info, error, warn } from "../utils/logger";

export interface ConnectionConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  maxPoolSize: number;
}

interface PoolState {
  active: number;
  idle: number;
  waiting: number;
}

let pool: PoolState = { active: 0, idle: 0, waiting: 0 };
let connected = false;

export async function connect(config: ConnectionConfig): Promise<void> {
  info("Connecting to database", { host: config.host, port: config.port });

  if (connected) {
    warn("Already connected to database");
    return;
  }

  try {
    pool = { active: 0, idle: config.maxPoolSize, waiting: 0 };
    connected = true;
    info("Database connection established", { poolSize: config.maxPoolSize });
  } catch (err) {
    error("Failed to connect to database", { error: String(err) });
    throw err;
  }
}

export async function disconnect(): Promise<void> {
  if (!connected) {
    return;
  }

  info("Disconnecting from database");
  pool = { active: 0, idle: 0, waiting: 0 };
  connected = false;
}

export function getPoolState(): PoolState {
  return { ...pool };
}

export function isConnected(): boolean {
  return connected;
}

export async function query<T>(sql: string, params?: unknown[]): Promise<T[]> {
  if (!connected) {
    throw new Error("Not connected to database");
  }

  pool.active++;
  pool.idle--;

  try {
    info("Executing query", { sql: sql.slice(0, 100), paramCount: params?.length ?? 0 });
    // Simulated query execution
    return [] as T[];
  } finally {
    pool.active--;
    pool.idle++;
  }
}
