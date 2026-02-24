ALTER TABLE prism_projects ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX prism_projects_slug_unique ON prism_projects (slug) WHERE slug IS NOT NULL;
