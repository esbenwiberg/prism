/**
 * History indexing layer.
 *
 * Parses git log output to extract commits, per-file change stats,
 * PR/ticket references, and computes change frequency per file.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { logger } from "../../logger.js";
import {
  bulkInsertCommits,
  bulkInsertCommitFiles,
  deleteCommitsByProjectId,
  type InsertCommitInput,
  type InsertCommitFileInput,
} from "../../db/queries/commits.js";
import { getProjectFiles, type FileRow } from "../../db/queries/files.js";
import { getDb } from "../../db/connection.js";
import { files } from "../../db/schema.js";
import { eq, and } from "drizzle-orm";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Git log parser types
// ---------------------------------------------------------------------------

interface ParsedCommit {
  sha: string;
  authorName: string;
  authorEmail: string;
  committedAt: Date;
  message: string;
  metadata: Record<string, unknown>;
  files: Array<{
    linesAdded: number | null;
    linesRemoved: number | null;
    filePath: string;
    changeType: string;
  }>;
}

// ---------------------------------------------------------------------------
// Git log format
// ---------------------------------------------------------------------------

// Custom delimiter-separated format for reliable parsing
const COMMIT_SEP = "---PRISM_COMMIT---";
const FIELD_SEP = "---PRISM_FIELD---";
const FORMAT = `${COMMIT_SEP}%n%H${FIELD_SEP}%an${FIELD_SEP}%ae${FIELD_SEP}%aI${FIELD_SEP}%s`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface HistoryLayerOptions {
  projectPath: string;
  projectId: number;
  maxCommits?: number;
  fullReindex?: boolean;
}

/**
 * Run the history indexing layer.
 *
 * 1. Runs `git log --numstat` on the project's clone
 * 2. Parses commits + per-file change stats
 * 3. Extracts PR refs, ticket numbers from commit messages
 * 4. Persists to prism_commits + prism_commit_files
 * 5. Updates change_frequency and last_changed_at on prism_files
 */
export async function runHistoryLayer(
  options: HistoryLayerOptions,
): Promise<{ commitsProcessed: number; filesUpdated: number }> {
  const { projectPath, projectId, maxCommits = 200, fullReindex = false } = options;

  logger.info({ projectId, projectPath, maxCommits }, "Starting history layer");

  if (fullReindex) {
    await deleteCommitsByProjectId(projectId);
  }

  // Run git log
  const rawLog = await getGitLog(projectPath, maxCommits);
  if (!rawLog.trim()) {
    logger.info({ projectId }, "No git history found");
    return { commitsProcessed: 0, filesUpdated: 0 };
  }

  // Parse commits
  const parsed = parseGitLog(rawLog);
  logger.info({ projectId, parsedCommits: parsed.length }, "Parsed git log");

  // Build file path → fileId lookup
  const projectFiles = await getProjectFiles(projectId);
  const fileByPath = new Map<string, FileRow>(
    projectFiles.map((f) => [f.path, f]),
  );

  // Persist commits
  let commitsProcessed = 0;
  const fileChangeCount = new Map<number, { count: number; lastChanged: Date }>();

  // Process in batches to avoid huge inserts
  const BATCH_SIZE = 50;
  for (let i = 0; i < parsed.length; i += BATCH_SIZE) {
    const batch = parsed.slice(i, i + BATCH_SIZE);

    const commitInputs: InsertCommitInput[] = batch.map((c) => ({
      projectId,
      sha: c.sha,
      authorName: c.authorName,
      authorEmail: c.authorEmail,
      committedAt: c.committedAt,
      message: c.message,
      metadata: c.metadata,
    }));

    const insertedCommits = await bulkInsertCommits(commitInputs);
    commitsProcessed += insertedCommits.length;

    // Build sha → id map for inserted commits
    const commitIdBySha = new Map(
      insertedCommits.map((c) => [c.sha, c.id]),
    );

    // Persist commit files
    const commitFileInputs: InsertCommitFileInput[] = [];
    for (const c of batch) {
      const commitId = commitIdBySha.get(c.sha);
      if (!commitId) continue; // Was a duplicate, skipped by onConflictDoNothing

      for (const f of c.files) {
        const file = fileByPath.get(f.filePath);
        commitFileInputs.push({
          commitId,
          fileId: file?.id ?? null,
          filePath: f.filePath,
          changeType: f.changeType,
          linesAdded: f.linesAdded,
          linesRemoved: f.linesRemoved,
        });

        // Track change frequency
        if (file) {
          const existing = fileChangeCount.get(file.id) ?? { count: 0, lastChanged: new Date(0) };
          existing.count++;
          if (c.committedAt > existing.lastChanged) {
            existing.lastChanged = c.committedAt;
          }
          fileChangeCount.set(file.id, existing);
        }
      }
    }

    if (commitFileInputs.length > 0) {
      await bulkInsertCommitFiles(commitFileInputs);
    }
  }

  // Update change_frequency and last_changed_at on prism_files
  const db = getDb();
  let filesUpdated = 0;
  for (const [fileId, data] of fileChangeCount) {
    await db
      .update(files)
      .set({
        changeFrequency: data.count,
        lastChangedAt: data.lastChanged,
      })
      .where(eq(files.id, fileId));
    filesUpdated++;
  }

  logger.info(
    { projectId, commitsProcessed, filesUpdated },
    "History layer complete",
  );

  return { commitsProcessed, filesUpdated };
}

// ---------------------------------------------------------------------------
// Git log execution
// ---------------------------------------------------------------------------

async function unshallowIfNeeded(projectPath: string): Promise<void> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--is-shallow-repository"], {
      cwd: projectPath,
    });
    if (stdout.trim() === "true") {
      logger.info({ projectPath }, "Unshallowing clone for history layer");
      await execFileAsync("git", ["fetch", "--unshallow"], {
        cwd: projectPath,
        timeout: 300_000, // 5 min
      });
    }
  } catch (err) {
    logger.warn(
      { projectPath, error: err instanceof Error ? err.message : String(err) },
      "Failed to unshallow clone — history may be incomplete",
    );
  }
}

async function getGitLog(
  projectPath: string,
  maxCommits: number,
): Promise<string> {
  try {
    await unshallowIfNeeded(projectPath);

    const { stdout } = await execFileAsync(
      "git",
      [
        "log",
        `--format=${FORMAT}`,
        "--numstat",
        `-n`,
        String(maxCommits),
      ],
      {
        cwd: projectPath,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      },
    );
    return stdout;
  } catch (err) {
    logger.warn(
      { projectPath, error: err instanceof Error ? err.message : String(err) },
      "Failed to get git log",
    );
    return "";
  }
}

// ---------------------------------------------------------------------------
// Git log parser
// ---------------------------------------------------------------------------

export function parseGitLog(raw: string): ParsedCommit[] {
  const commits: ParsedCommit[] = [];
  const blocks = raw.split(COMMIT_SEP).filter((b) => b.trim());

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length === 0) continue;

    // First line contains the field-separated header
    const headerLine = lines[0];
    const fields = headerLine.split(FIELD_SEP);
    if (fields.length < 5) continue;

    const [sha, authorName, authorEmail, dateStr, ...messageParts] = fields;
    const message = messageParts.join(FIELD_SEP); // In case message contains separator

    const committedAt = new Date(dateStr);
    if (isNaN(committedAt.getTime())) continue;

    // Extract metadata from commit message
    const metadata = extractMetadata(message);

    // Parse numstat lines (remaining lines)
    const fileChanges: ParsedCommit["files"] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const match = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (!match) continue;

      const linesAdded = match[1] === "-" ? null : parseInt(match[1], 10);
      const linesRemoved = match[2] === "-" ? null : parseInt(match[2], 10);
      let filePath = match[3];

      // Handle renames: "old => new" or "{old => new}/path"
      let changeType = "modify";
      const renameMatch = filePath.match(/\{(.+) => (.+)\}(.*)/);
      if (renameMatch) {
        filePath = renameMatch[2] + renameMatch[3];
        changeType = "rename";
      } else if (filePath.includes(" => ")) {
        const parts = filePath.split(" => ");
        filePath = parts[1];
        changeType = "rename";
      }

      // Detect add/delete from numstat
      if (linesRemoved === null && linesAdded !== null && linesAdded > 0) {
        changeType = "add";
      }

      fileChanges.push({ linesAdded, linesRemoved, filePath, changeType });
    }

    commits.push({
      sha: sha.trim(),
      authorName: authorName.trim(),
      authorEmail: authorEmail.trim(),
      committedAt,
      message: message.trim(),
      metadata,
      files: fileChanges,
    });
  }

  return commits;
}

/**
 * Extract PR numbers and ticket references from commit messages.
 */
function extractMetadata(message: string): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};

  // PR references: (#123), Merge pull request #123
  const prMatches = message.match(/#(\d+)/g);
  if (prMatches) {
    metadata.prNumbers = [...new Set(prMatches.map((m) => parseInt(m.slice(1), 10)))];
  }

  // Ticket references: JIRA-123, AB#456, [TICKET-789]
  const ticketPattern = /\b([A-Z]{2,10}-\d+)\b|AB#(\d+)/g;
  const tickets: string[] = [];
  let ticketMatch;
  while ((ticketMatch = ticketPattern.exec(message)) !== null) {
    tickets.push(ticketMatch[1] ?? `AB#${ticketMatch[2]}`);
  }
  if (tickets.length > 0) {
    metadata.tickets = [...new Set(tickets)];
  }

  return metadata;
}
