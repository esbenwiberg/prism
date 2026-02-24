ALTER TABLE prism_projects ADD COLUMN slug TEXT;

-- Backfill slug from git_url for existing projects
-- Extracts "owner/repo" from URLs like:
--   https://github.com/owner/repo.git  → owner/repo
--   https://github.com/owner/repo      → owner/repo
--   git@github.com:owner/repo.git      → owner/repo
UPDATE prism_projects
SET slug = regexp_replace(git_url, '^.*[/:]([^/:]+/[^/.]+?)(?:\.git)?$', '\1')
WHERE git_url IS NOT NULL AND slug IS NULL;

CREATE UNIQUE INDEX prism_projects_slug_unique ON prism_projects (slug) WHERE slug IS NOT NULL;
