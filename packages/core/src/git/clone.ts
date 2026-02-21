/**
 * Git clone/cleanup service with PAT injection for private repos.
 *
 * Supports GitHub and Azure DevOps HTTPS URLs.
 * Clones are shallow (--depth 1) by default for speed.
 */

import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";

import { logger } from "../logger.js";
import type { CloneOptions, CloneResult } from "./types.js";
import { CLONE_BASE_DIR } from "./types.js";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

/**
 * Regex for valid HTTPS git URLs.
 *
 * Matches:
 * - https://github.com/org/repo
 * - https://github.com/org/repo.git
 * - https://dev.azure.com/org/project/_git/repo
 * - https://user@dev.azure.com/org/project/_git/repo
 */
const HTTPS_GIT_URL_RE =
  /^https:\/\/[^@/\s]+(?:@[^/\s]+)?(?:\/[^/\s]+)+(?:\.git)?$/;

/**
 * Validate that a URL is a supported HTTPS git URL.
 *
 * Rejects SSH URLs (git@...), file:// paths, and invalid formats.
 */
export function isValidGitUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  return HTTPS_GIT_URL_RE.test(url.trim());
}

// ---------------------------------------------------------------------------
// PAT injection
// ---------------------------------------------------------------------------

/**
 * Inject a PAT into an HTTPS git URL for authentication.
 *
 * - GitHub: `https://<PAT>@github.com/org/repo.git`
 * - Azure DevOps: `https://<PAT>@dev.azure.com/org/project/_git/repo`
 *
 * @internal Exported for testing only.
 */
export function injectPat(
  url: string,
  pat: string,
  provider: "github" | "azuredevops",
): string {
  const parsed = new URL(url);

  if (provider === "github") {
    parsed.username = pat;
    parsed.password = "";
  } else {
    // Azure DevOps uses PAT as the password with an empty username,
    // or PAT as the username — both work. We use username form.
    parsed.username = pat;
    parsed.password = "";
  }

  return parsed.toString();
}

/**
 * Redact any credentials from a git URL for safe logging.
 */
function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.username) {
      parsed.username = "***";
      parsed.password = "";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Clone & cleanup
// ---------------------------------------------------------------------------

/**
 * Build the default clone destination for a project.
 */
export function cloneDestination(projectId: number | string): string {
  return `${CLONE_BASE_DIR}/${projectId}`;
}

/**
 * Clone a git repository to the specified directory.
 *
 * @param url - HTTPS git URL.
 * @param destDir - Local directory to clone into.
 * @param options - Optional PAT and provider for private repos.
 * @returns Clone result with the destination path and (redacted) URL.
 * @throws if the URL is invalid or the git command fails.
 */
export async function cloneRepo(
  url: string,
  destDir: string,
  options?: CloneOptions,
): Promise<CloneResult> {
  if (!isValidGitUrl(url)) {
    throw new Error(`Invalid git URL: ${url}`);
  }

  let cloneUrl = url;

  if (options?.pat && options.provider) {
    cloneUrl = injectPat(url, options.pat, options.provider);
  }

  const depth = options?.depth ?? 1;
  const args = ["clone", "--depth", String(depth), cloneUrl, destDir];

  logger.info(
    { url: redactUrl(cloneUrl), destDir, depth },
    "Cloning repository",
  );

  try {
    await execFileAsync("git", args, { timeout: 300_000 }); // 5 min timeout
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown git clone error";
    // Ensure PAT is never leaked in error messages
    const safeMessage = message.replace(
      /https:\/\/[^@]+@/g,
      "https://***@",
    );
    logger.error({ err: safeMessage, url: redactUrl(cloneUrl) }, "Clone failed");
    throw new Error(`git clone failed: ${safeMessage}`);
  }

  logger.info({ destDir }, "Clone completed");

  return {
    destDir,
    url: redactUrl(cloneUrl),
  };
}

/**
 * Remove a cloned repository directory.
 *
 * Safe to call even if the directory does not exist.
 */
export async function cleanupClone(destDir: string): Promise<void> {
  logger.info({ destDir }, "Cleaning up clone directory");

  try {
    await rm(destDir, { recursive: true, force: true });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown cleanup error";
    logger.warn({ err: message, destDir }, "Failed to clean up clone directory");
    // Don't throw — cleanup failures are non-fatal
  }
}
