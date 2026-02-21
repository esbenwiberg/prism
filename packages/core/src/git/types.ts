/**
 * Types for the git clone service.
 */

import type { GitProvider } from "../domain/types.js";

/** Options for cloning a repository. */
export interface CloneOptions {
  /** Personal access token for private repos. */
  pat?: string;
  /** Git hosting provider (determines PAT injection format). */
  provider?: GitProvider;
  /** Clone depth (defaults to 1 for shallow clone). */
  depth?: number;
}

/** Result of a successful clone operation. */
export interface CloneResult {
  /** Absolute path to the cloned repository. */
  destDir: string;
  /** The URL that was cloned (with PAT redacted if present). */
  url: string;
}

/** Base directory for ephemeral clones. */
export const CLONE_BASE_DIR = "/tmp/prism-clones";
