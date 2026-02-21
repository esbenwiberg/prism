# Milestone 6 Handoff: Web-Triggered Project Creation & Indexing

## Summary

Dashboard UI for adding projects by git URL, triggering indexing and blueprint generation, with HTMX-powered progress polling.

## What Was Built

### New Files
- `packages/app/src/dashboard/views/add-project.ts` — "Add Project" form view with git URL input, project name (auto-derived), and credential dropdown
- `packages/app/src/dashboard/views/job-progress.ts` — HTMX polling fragment showing job status, current layer, files processed/total, elapsed time, and cost

### Modified Files
- `packages/app/src/dashboard/routes/overview.ts` — Added `GET /projects/new` and `POST /projects` routes
- `packages/app/src/dashboard/routes/project.ts` — Added `POST /projects/:id/index`, `POST /projects/:id/blueprint`, and `GET /projects/:id/progress` routes
- `packages/app/src/dashboard/views/project.ts` — Added Index/Re-index/Generate Blueprints action buttons and progress section
- `packages/app/src/dashboard/views/overview.ts` — Added "Add Project" button to overview page
- `packages/app/src/dashboard/views/index.ts` — Added barrel exports for new views
- `packages/core/src/db/queries/projects.ts` — Extended `createProject()` to accept `gitUrl` and `credentialId` via `CreateProjectOptions`
- `packages/core/src/db/queries/index.ts` — Exported `CreateProjectOptions` type

### New Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/projects/new` | "Add Project" form |
| POST | `/projects` | Create project from git URL |
| POST | `/projects/:id/index` | Queue indexing job |
| POST | `/projects/:id/blueprint` | Queue blueprint generation job |
| GET | `/projects/:id/progress` | HTMX fragment: latest job status + index run progress |

## Key Design Decisions

1. **Project creation flow**: Projects are created with a temporary path, then immediately updated to use `cloneDestination(projectId)` (i.e., `/tmp/prism-clones/{id}`). The worker (from M5) handles the actual cloning.

2. **Backward-compatible `createProject`**: The third parameter now accepts either the legacy `Record<string, unknown>` (settings) or a `CreateProjectOptions` object with `gitUrl`, `credentialId`, and optional `settings`. Detection is based on the presence of `gitUrl` or `credentialId` keys.

3. **HTMX polling**: The progress fragment uses `hx-trigger="every 3s"` only when the latest job is in `pending` or `running` status. Once completed or failed, polling stops automatically.

4. **Route ordering**: `GET /projects/new` is in `overviewRouter` which is registered before `projectRouter` (containing `GET /projects/:id`), preventing "new" from being captured as a project ID.

## Verification

- `npm run build` passes (TypeScript strict mode)
- `npm test` passes (all 313 tests)
- No changes to existing test files

## Dependencies on Prior Milestones

- **M4 (Credentials)**: Uses `listCredentials()` for the credential dropdown
- **M5 (Worker)**: Jobs created via `createJob()` are picked up by the worker process
- **M3 (Jobs table)**: Uses `createJob()`, `getJobsByProjectId()`, `getIndexRunsByProjectId()`

## What's Next

- M7: Worker clone integration (the worker picks up index/blueprint jobs, clones repos, runs the indexing pipeline)
- M8: Blueprint download / export from the dashboard
