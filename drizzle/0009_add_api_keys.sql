CREATE TABLE IF NOT EXISTS "prism_api_keys" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "key_hash" text NOT NULL,
  "key_prefix" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_used_at" timestamptz,
  CONSTRAINT "prism_api_keys_key_hash_unique" UNIQUE("key_hash")
);
