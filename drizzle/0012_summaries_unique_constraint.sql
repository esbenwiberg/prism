-- Deduplicate existing summary rows (keep the latest per project+level+target)
DELETE FROM prism_summaries a USING prism_summaries b
WHERE a.project_id = b.project_id AND a.level = b.level
  AND a.target_id = b.target_id AND a.id < b.id;

-- Prevent future duplicates
ALTER TABLE prism_summaries
  ADD CONSTRAINT prism_summaries_project_level_target
  UNIQUE (project_id, level, target_id);
