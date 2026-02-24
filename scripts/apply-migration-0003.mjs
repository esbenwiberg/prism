/**
 * One-off script: manually apply migration 0003_embedding_dimensions_3072
 * against the production database, bypassing the destructive-SQL guard.
 *
 * Run: DATABASE_URL=<url> node scripts/apply-migration-0003.mjs
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const MIGRATION_FILE = path.resolve("drizzle/0003_embedding_dimensions_3072.sql");
const FOLDER_MILLIS = 1700000003000;
const MIGRATIONS_TABLE = "drizzle.prism_migrations";

const raw = fs.readFileSync(MIGRATION_FILE, "utf8");
const hash = crypto.createHash("sha256").update(raw).digest("hex");
const statements = raw
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

console.log("Migration file:", MIGRATION_FILE);
console.log("Hash:          ", hash);
console.log("Statements:    ", statements.length);
console.log();

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  // Check if already applied
  const { rows } = await client.query(
    `SELECT hash FROM ${MIGRATIONS_TABLE} WHERE hash = $1`,
    [hash],
  );
  if (rows.length > 0) {
    console.log("Migration 0003 is already recorded as applied. Nothing to do.");
    process.exit(0);
  }

  console.log("Applying migration 0003...");
  for (const stmt of statements) {
    console.log("  >>", stmt.slice(0, 80).replace(/\n/g, " "));
    await client.query(stmt);
  }

  // Record the migration
  await client.query(
    `INSERT INTO ${MIGRATIONS_TABLE} (hash, created_at) VALUES ($1, $2)`,
    [hash, FOLDER_MILLIS],
  );

  console.log("\nDone. Migration 0003 applied and recorded.");
} finally {
  await client.end();
}
