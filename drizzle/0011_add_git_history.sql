-- Git history tables for commit tracking and drift review.

CREATE TABLE prism_commits (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES prism_projects(id) ON DELETE CASCADE,
  sha TEXT NOT NULL,
  author_name TEXT,
  author_email TEXT,
  committed_at TIMESTAMPTZ,
  message TEXT NOT NULL,
  metadata JSONB,
  UNIQUE(project_id, sha)
);

CREATE TABLE prism_commit_files (
  id SERIAL PRIMARY KEY,
  commit_id INTEGER NOT NULL REFERENCES prism_commits(id) ON DELETE CASCADE,
  file_id INTEGER REFERENCES prism_files(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  change_type TEXT NOT NULL,
  lines_added INTEGER,
  lines_removed INTEGER
);

CREATE INDEX idx_commit_files_file_id ON prism_commit_files(file_id);
CREATE INDEX idx_commits_project_time ON prism_commits(project_id, committed_at DESC);

-- Add change tracking columns to files
ALTER TABLE prism_files ADD COLUMN change_frequency INTEGER DEFAULT 0;
ALTER TABLE prism_files ADD COLUMN last_changed_at TIMESTAMPTZ;
