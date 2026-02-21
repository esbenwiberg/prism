# Milestone 5 Handoff: Job Queue & Worker Process

## Summary

Implemented a background worker process that polls `prism_jobs` and executes indexing and blueprint jobs one at a time.

## What Was Built

### New Files

| File | Purpose |
|------|---------|
| `packages/app/src/worker/executor.ts` | Job type dispatcher — routes "index" and "blueprint" jobs to their handlers |
| `packages/app/src/worker/index.ts` | Worker polling loop with graceful shutdown (SIGTERM/SIGINT) |
| `packages/app/src/cli/commands/worker.ts` | `prism worker` CLI command |
| `packages/app/src/worker/executor.test.ts` | Unit tests for executor (8 tests) |
| `packages/app/src/worker/worker.test.ts` | Unit tests for worker state management (2 tests) |

### Modified Files

| File | Change |
|------|--------|
| `packages/app/src/cli/index.ts` | Registered the `workerCommand` in the CLI |

## Architecture

```
prism worker
    |
    v
startWorker()  [packages/app/src/worker/index.ts]
    |
    +-- while (!shutdown)
    |     |
    |     +-- claimNextJob()  [SELECT FOR UPDATE SKIP LOCKED]
    |     |
    |     +-- executeJob(job) [packages/app/src/worker/executor.ts]
    |     |     |
    |     |     +-- "index"     -> cloneRepo() -> updateProject(path) -> runPipeline() -> cleanupClone()
    |     |     +-- "blueprint" -> generateHierarchicalBlueprint()
    |     |
    |     +-- completeJob(id)  or  failJob(id, error)
    |     |
    |     +-- sleep(5s) if idle
    |
    +-- On SIGTERM/SIGINT: finish current job, then exit
```

## Key Design Decisions

1. **One job at a time** — No concurrency, matching the non-goal of "no concurrent indexing".

2. **Graceful shutdown** — On SIGTERM/SIGINT, the worker finishes the current job before exiting. If idle, it exits immediately.

3. **Clone lifecycle** — The `finally` block ensures `cleanupClone()` is always called, even if the pipeline throws. After cleanup, the project path is cleared (set to empty string).

4. **Credential decryption** — The worker decrypts PATs using `CREDENTIAL_ENCRYPTION_KEY` env var before injecting them into clone URLs. If the env var is missing and a credential is needed, the job fails with a clear error.

5. **Calls existing code** — The worker does NOT reimplement the pipeline or blueprint generator. It calls `runPipeline()` from `@prism/core` and `generateHierarchicalBlueprint()` from `packages/app/src/blueprint/generator.ts`.

6. **Error isolation** — The executor catches all errors and returns them as `ExecutionResult`. The polling loop additionally wraps the claim/execute/complete cycle with a try/catch so a single job failure never crashes the worker.

## Dependencies Used (from prior milestones)

- `claimNextJob()`, `completeJob()`, `failJob()` from `@prism/core` (job queue)
- `cloneRepo()`, `cleanupClone()`, `cloneDestination()` from `@prism/core` (git clone)
- `decryptToken()` from `@prism/core` (credential encryption)
- `getProject()`, `updateProject()`, `getCredential()` from `@prism/core` (DB queries)
- `runPipeline()` from `@prism/core` (indexing pipeline)
- `generateHierarchicalBlueprint()` from `packages/app/src/blueprint/generator.ts`

## Testing

- **10 new tests** (8 executor + 2 worker state)
- **313 total tests pass** (all existing tests unaffected)
- Build passes with `npm run build`

## How to Run

```bash
# Start the worker (requires database connection)
npx prism worker

# The worker polls prism_jobs every 5 seconds
# Stop with Ctrl+C (SIGINT) or SIGTERM
```

## What Comes Next (Milestone 6+)

- Dashboard routes to create jobs (trigger indexing/blueprint from the UI)
- Containerized deployment with web + worker processes
