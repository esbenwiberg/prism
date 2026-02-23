/**
 * @prism/core — Indexing engine, database, and domain types.
 *
 * This is the barrel export for the core package.
 */

export { logger, logBuffer } from "./logger.js";
export type { LogEntry } from "./log-buffer.js";
export * from "./db/index.js";
export * from "./domain/index.js";
export * from "./indexer/index.js";
export * from "./crypto/credentials.js";
export * from "./git/types.js";
export * from "./git/clone.js";
