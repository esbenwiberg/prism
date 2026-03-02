ALTER TABLE "prism_api_keys"
  ADD COLUMN "permissions" jsonb NOT NULL DEFAULT '["read"]'::jsonb;
