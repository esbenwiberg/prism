/**
 * Job executor — dispatches jobs by type to the appropriate handler.
 *
 * Handles "index" and "blueprint" job types by calling the existing
 * pipeline and blueprint generator respectively.
 */

import {
  logger,
  getProject,
  getCredential,
  updateProject,
  cloneRepo,
  cleanupClone,
  cloneDestination,
  decryptToken,
  runPipeline,
  initConfig,
  createBudgetTracker,
  createIndexRun,
  updateIndexRunProgress,
  completeIndexRun,
  failIndexRun,
  type JobRow,
  type JobOptions,
  type GitProvider,
} from "@prism/core";

import { generateHierarchicalBlueprint } from "../blueprint/generator.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of executing a job. */
export interface ExecutionResult {
  success: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a claimed job based on its type.
 *
 * - "index": clone the repo, run the indexing pipeline, cleanup clone.
 * - "blueprint": generate a hierarchical blueprint from analysis results.
 *
 * Always cleans up cloned directories, even on failure.
 *
 * @throws Never — catches all errors and returns them in the result.
 */
export async function executeJob(job: JobRow): Promise<ExecutionResult> {
  const jobType = job.type as "index" | "blueprint";
  const options = (job.options ?? {}) as JobOptions;

  logger.info(
    { jobId: job.id, type: jobType, projectId: job.projectId },
    "Executing job",
  );

  try {
    switch (jobType) {
      case "index":
        await executeIndexJob(job.projectId, options);
        break;

      case "blueprint":
        await executeBlueprintJob(job.projectId, options);
        break;

      default:
        throw new Error(`Unknown job type: ${jobType}`);
    }

    logger.info({ jobId: job.id, type: jobType }, "Job completed successfully");
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      { jobId: job.id, type: jobType, error: message },
      "Job execution failed",
    );
    return { success: false, error: message };
  }
}

// ---------------------------------------------------------------------------
// Index job
// ---------------------------------------------------------------------------

/**
 * Execute an indexing job:
 *   1. Load the project and (optionally) its credential.
 *   2. Clone the repo to an ephemeral directory.
 *   3. Set the project path to the clone directory.
 *   4. Run the indexing pipeline.
 *   5. Cleanup the clone directory (always, even on failure).
 */
async function executeIndexJob(
  projectId: number,
  options: JobOptions,
): Promise<void> {
  const project = await getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (!project.gitUrl) {
    throw new Error(
      `Project ${projectId} has no git URL — cannot clone for indexing`,
    );
  }

  // Decrypt credential if the project has one
  let pat: string | undefined;
  let provider: GitProvider | undefined;

  if (project.credentialId) {
    const credential = await getCredential(project.credentialId);
    if (!credential) {
      throw new Error(
        `Credential ${project.credentialId} not found for project ${projectId}`,
      );
    }

    const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error(
        "CREDENTIAL_ENCRYPTION_KEY env var is required to decrypt credentials",
      );
    }

    pat = decryptToken(credential.encryptedToken, encryptionKey);
    provider = credential.provider as GitProvider;
  }

  // Clone the repository
  const destDir = cloneDestination(projectId);

  try {
    await cloneRepo(project.gitUrl, destDir, { pat, provider });

    // Temporarily set the project path to the clone directory
    await updateProject(projectId, { path: destDir });

    // Re-fetch the project so the pipeline sees the updated path
    const updatedProject = await getProject(projectId);
    if (!updatedProject) {
      throw new Error(`Project ${projectId} disappeared during indexing`);
    }

    // Run the indexing pipeline
    await runPipeline(updatedProject, {
      fullReindex: options.fullReindex ?? true,
    });
  } finally {
    // Always cleanup the clone directory
    await cleanupClone(destDir);

    // Clear the project path (clone dir is gone)
    await updateProject(projectId, { path: "" });
  }
}

// ---------------------------------------------------------------------------
// Blueprint job
// ---------------------------------------------------------------------------

/**
 * Execute a blueprint generation job:
 *   1. Load the project.
 *   2. Initialize configuration.
 *   3. Generate the hierarchical blueprint.
 */
async function executeBlueprintJob(
  projectId: number,
  options: JobOptions,
): Promise<void> {
  const project = await getProject(projectId);
  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  const config = initConfig();
  const budget = createBudgetTracker(config.blueprint.budgetUsd);
  const startTime = Date.now();

  // Index run created once we know total phases (after pass 1)
  let runId: number | undefined;

  const onProgress = async (phasesComplete: number, totalPhases: number) => {
    if (runId === undefined) {
      // First call — now we know the phase count, create the run
      const run = await createIndexRun(projectId, "blueprint", totalPhases);
      runId = run.id;
    } else {
      await updateIndexRunProgress(runId, phasesComplete);
    }
  };

  try {
    const result = await generateHierarchicalBlueprint(
      projectId,
      project.name,
      config.blueprint,
      budget,
      { goal: options.goal, focus: options.focus },
      onProgress,
    );

    if (!result) {
      logger.warn(
        { projectId },
        "Blueprint generation produced no result — ensure the project has been analysed first",
      );
      return;
    }

    const totalPhases = result.phases.length;
    if (runId !== undefined) {
      await completeIndexRun(runId, totalPhases, Date.now() - startTime, budget.spentUsd);
    }
  } catch (err) {
    if (runId !== undefined) {
      const msg = err instanceof Error ? err.message : String(err);
      await failIndexRun(runId, msg, 0, Date.now() - startTime);
    }
    throw err;
  }
}
