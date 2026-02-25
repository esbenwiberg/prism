/**
 * Worker process — polls prism_jobs and executes them one at a time.
 *
 * Design:
 * - Polls every 5 seconds when idle.
 * - One job at a time (no concurrency).
 * - Graceful shutdown on SIGTERM/SIGINT: finishes current job, then exits.
 * - On job failure: catches error, calls failJob(), continues polling.
 * - Polls prism_reindex_requests every 15 minutes and converts to jobs.
 */

import {
  logger,
  claimNextJob,
  completeJob,
  failJob,
  getJobStatus,
  resetStaleJobs,
  listReindexRequests,
  deleteReindexRequest,
  createJob,
  hasActiveJobForProject,
} from "@prism/core";

import { executeJob } from "./executor.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Time to wait between polls when no jobs are available (ms). */
const POLL_INTERVAL_MS = 5_000;

/** How often to check the reindex request queue and convert to jobs (ms). */
const REINDEX_POLL_INTERVAL_MS = 15 * 60 * 1_000; // 15 minutes

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let shutdownRequested = false;
let currentlyExecuting = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the worker polling loop.
 *
 * Runs indefinitely until a shutdown signal is received.
 * Returns a promise that resolves when the worker has cleanly stopped.
 */
export async function startWorker(): Promise<void> {
  shutdownRequested = false;
  currentlyExecuting = false;

  // Declare before signal handlers so the closure can reference it.
  let reindexTimer: ReturnType<typeof setInterval> | undefined;

  // Install signal handlers for graceful shutdown
  const onSignal = (signal: string) => {
    logger.info({ signal }, "Shutdown signal received");
    shutdownRequested = true;
    if (reindexTimer !== undefined) {
      clearInterval(reindexTimer);
    }

    if (!currentlyExecuting) {
      // Not executing a job — exit immediately
      logger.info("No job in progress, exiting now");
      process.exit(0);
    }

    logger.info("Waiting for current job to finish before exiting");
  };

  process.on("SIGTERM", () => onSignal("SIGTERM"));
  process.on("SIGINT", () => onSignal("SIGINT"));

  // Recover any jobs left in "running" state from a previous crash
  const staleCount = await resetStaleJobs();
  if (staleCount > 0) {
    logger.info({ staleCount }, "Reset stale running jobs from previous crash");
  }

  // Start the reindex-request poller: converts prism_reindex_requests rows
  // into prism_jobs entries every 15 minutes.
  reindexTimer = setInterval(() => {
    processReindexRequests().catch((err: unknown) => {
      logger.error(
        { error: err instanceof Error ? err.message : String(err) },
        "Error processing reindex requests",
      );
    });
  }, REINDEX_POLL_INTERVAL_MS);

  // Run once immediately on startup so requests queued before the last restart
  // are picked up without waiting 15 minutes.
  processReindexRequests().catch((err: unknown) => {
    logger.error(
      { error: err instanceof Error ? err.message : String(err) },
      "Error processing reindex requests on startup",
    );
  });

  logger.info("Worker started — polling for jobs");

  while (!shutdownRequested) {
    try {
      const job = await claimNextJob();

      if (!job) {
        // No pending jobs — wait and retry
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      logger.info(
        { jobId: job.id, type: job.type, projectId: job.projectId },
        "Claimed job",
      );

      currentlyExecuting = true;

      try {
        const result = await executeJob(job);

        // Re-check the job status — it may have been cancelled while running
        const currentStatus = await getJobStatus(job.id);
        if (currentStatus === "cancelled") {
          logger.info({ jobId: job.id }, "Job was cancelled, skipping status update");
        } else if (result.success) {
          await completeJob(job.id);
          logger.info({ jobId: job.id }, "Job marked completed");
        } else {
          await failJob(job.id, result.error ?? "Unknown error");
          logger.warn(
            { jobId: job.id, error: result.error },
            "Job marked failed",
          );
        }
      } catch (err: unknown) {
        // Unexpected error in the executor or in completeJob/failJob
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          { jobId: job.id, error: message },
          "Unexpected error processing job",
        );

        try {
          // Don't overwrite cancelled status
          const currentStatus = await getJobStatus(job.id);
          if (currentStatus !== "cancelled") {
            await failJob(job.id, message);
          }
        } catch (failErr: unknown) {
          logger.error(
            {
              jobId: job.id,
              error: failErr instanceof Error ? failErr.message : String(failErr),
            },
            "Failed to mark job as failed",
          );
        }
      } finally {
        currentlyExecuting = false;
      }
    } catch (err: unknown) {
      // Error in claimNextJob or sleep — log and continue
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message }, "Error in worker poll loop");
      await sleep(POLL_INTERVAL_MS);
    }
  }

  logger.info("Worker stopped");
}

// ---------------------------------------------------------------------------
// Reindex request processor
// ---------------------------------------------------------------------------

/**
 * Drain the prism_reindex_requests table and convert each row into a
 * prism_jobs "index" entry (one job per project). The jobs table is the
 * single-execution queue; the reindex_requests table provides dedup.
 */
async function processReindexRequests(): Promise<void> {
  const requests = await listReindexRequests();
  if (requests.length === 0) return;

  logger.info({ count: requests.length }, "Processing reindex requests");

  for (const req of requests) {
    try {
      const active = await hasActiveJobForProject(req.projectId);
      if (active) {
        logger.info(
          { projectId: req.projectId },
          "Skipping reindex request — active job already in progress for project",
        );
        continue;
      }

      await createJob(req.projectId, "index", { layers: req.layers as string[] });
      await deleteReindexRequest(req.id);
      logger.info(
        { projectId: req.projectId, layers: req.layers },
        "Queued index job from reindex request",
      );
    } catch (err: unknown) {
      logger.error(
        {
          projectId: req.projectId,
          error: err instanceof Error ? err.message : String(err),
        },
        "Failed to queue index job for reindex request",
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Testability
// ---------------------------------------------------------------------------

/**
 * Request the worker to shut down gracefully.
 *
 * Exported for testing purposes — production code uses SIGTERM/SIGINT.
 */
export function requestShutdown(): void {
  shutdownRequested = true;
}

/**
 * Check whether the worker is currently executing a job.
 *
 * Exported for testing purposes.
 */
export function isExecuting(): boolean {
  return currentlyExecuting;
}
