# Blueprint: Deploy Prism as Azure Container App

Prism needs to move from a CLI-only local tool to a web-deployable application. Users should be able to add repos by URL, trigger indexing from the dashboard, and download generated blueprints — all running as an Azure Container App backed by managed PostgreSQL.

**Milestones: 8**

## Non-Goals

- Multi-tenant / org isolation (single team, everyone sees everything)
- Redis or external job queues (Postgres-backed coordination only)
- CI/CD pipeline automation (manual deploy via Bicep for now)
- Postgres-backed sessions (in-memory is fine; users re-login on restart)
- Programmatic API for blueprints (web download only)
- Concurrent indexing (one job at a time, queued)

## Acceptance Criteria

- [ ] `docker compose up` starts Prism dashboard + Postgres with pgvector locally
- [ ] Users can add a project by pasting a git URL (GitHub or Azure DevOps) in the dashboard
- [ ] Users can manage git PATs (add/edit/delete) from the dashboard; PATs stored encrypted in Postgres
- [ ] Clicking "Index" on a project clones the repo, runs the pipeline, then cleans up the clone
- [ ] Indexing runs in a background worker process (not blocking the web server)
- [ ] Only one indexing job runs at a time; additional jobs queue
- [ ] Progress is visible in the dashboard (polled via HTMX from `prism_index_runs`)
- [ ] Blueprints can be downloaded as markdown or JSON from the dashboard
- [ ] Cloned repos are cleaned up after indexing (ephemeral `/tmp/prism-clones/`)
- [ ] Bicep templates deploy Container App + PostgreSQL Flexible Server + Key Vault to Azure
- [ ] All secrets (API keys, encryption key, DB password) stored in Azure Key Vault

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Container App (single container, two processes)        │
│                                                         │
│  ┌─────────────────┐     ┌────────────────────────────┐ │
│  │  Web Process     │     │  Worker Process            │ │
│  │  (Express :3100) │     │  (polls prism_jobs)        │ │
│  │                  │     │                            │ │
│  │  Dashboard UI    │     │  1. Claim pending job      │ │
│  │  + Credential    │     │  2. Clone repo → /tmp/     │ │
│  │    management    │     │  3. Run pipeline           │ │
│  │  + Job triggers  │     │  4. Cleanup clone          │ │
│  │  + Blueprint     │     │  5. Mark job complete      │ │
│  │    export        │     │                            │ │
│  └────────┬────────┘     └──────────┬─────────────────┘ │
│           │                         │                    │
│           │   /tmp/prism-clones/    │                    │
│           │   (ephemeral disk)      │                    │
│           └────────┬────────────────┘                    │
└────────────────────┼─────────────────────────────────────┘
                     │
            ┌────────▼────────┐     ┌──────────────┐
            │  Azure Database │     │  Azure Key   │
            │  for PostgreSQL │     │  Vault       │
            │  + pgvector     │     │  (secrets)   │
            └─────────────────┘     └──────────────┘
```

### Data Flow

1. **Add project**: User pastes git URL → `POST /projects` → inserts `prism_projects` row (with `gitUrl`)
2. **Trigger index**: User clicks "Index" → `POST /projects/:id/index` → inserts `prism_jobs` row (type: `index`, status: `pending`)
3. **Worker picks up job**: Polls `prism_jobs` for `pending` → claims (sets `status: running`) → clones repo → runs pipeline layers 1-4 → cleanup clone → marks job `completed`
4. **Generate blueprints**: User clicks "Generate Blueprints" → creates job (type: `blueprint`) → worker runs layer 5 from DB data only (no clone needed)
5. **Export blueprint**: User clicks "Download" → `GET /projects/:id/blueprints/:bid/export?format=md` → renders markdown and sends as file download

### New DB Tables

```
prism_credentials
  id, label, provider (github|azuredevops), encrypted_token, created_at, updated_at

prism_jobs
  id, project_id (FK), type (index|blueprint), status (pending|running|completed|failed),
  options (JSONB), error, created_at, started_at, completed_at
```

### Modified Tables

```
prism_projects
  + git_url (text, nullable)           -- HTTPS clone URL
  + credential_id (FK, nullable)       -- link to prism_credentials for private repos
```

### Encryption

PATs encrypted at rest using AES-256-GCM with `CREDENTIAL_ENCRYPTION_KEY` env var (32-byte hex key). The key lives in Azure Key Vault, injected as an env var at container startup.

## Folder/File Layout (new files only)

```
packages/core/src/
  db/
    schema.ts                     # + credentials, jobs tables
    queries/
      credentials.ts              # CRUD for encrypted credentials
      jobs.ts                     # Job queue operations (create, claim, complete, fail)
  git/
    clone.ts                      # Git clone/cleanup with PAT injection
    types.ts                      # CloneOptions, GitProvider types
  crypto/
    credentials.ts                # AES-256-GCM encrypt/decrypt for PATs

packages/app/src/
  worker/
    index.ts                      # Worker entry point (poll loop + graceful shutdown)
    executor.ts                   # Job type dispatch (index, blueprint)
  dashboard/
    routes/
      credentials.ts              # CRUD routes for credential management
      jobs.ts                     # POST /projects/:id/index, POST /projects/:id/blueprint
      export.ts                   # GET /projects/:id/blueprints/:bid/export
    views/
      credentials.ts              # Credential list + add/edit form
      add-project.ts              # "Add Project" form (git URL + name + credential picker)
      job-progress.ts             # HTMX polling fragment for job/indexing progress
  cli/
    commands/
      worker.ts                   # `prism worker` CLI command

drizzle/
  0001_*.sql                      # Migration: credentials + jobs tables, projects.git_url

Dockerfile
docker-compose.yml
deploy/
  main.bicep                      # Container App + PostgreSQL + Key Vault
  parameters.json                 # Default parameter values
.env.example                      # Updated with all env vars
```

---

## Milestone 1 — Dockerfile & Docker Compose

**Intent**: Containerize the existing app so it can run locally via `docker compose up`.

**Key files**:
- `Dockerfile` (new)
- `docker-compose.yml` (new)
- `.env.example` (update)

**Details**:
- Multi-stage Dockerfile: `node:22-slim` base, build stage installs deps + compiles TS, production stage copies dist + node_modules
- `docker-compose.yml`: Prism web (port 3100) + Postgres 16 with pgvector (`pgvector/pgvector:pg16`)
- Include `SKIP_AUTH=true` in dev compose for easy local testing
- Volume mount for Postgres data persistence
- Healthcheck on Prism (`/login` returns 200/302)
- Run `drizzle-kit migrate` on container startup (entrypoint script)

**Verification**:
```bash
docker compose build
docker compose up -d
curl -s http://localhost:3100/login  # should return 200 or redirect
docker compose down
```

---

## Milestone 2 — Schema Evolution

**Intent**: Add database tables for credentials and jobs; add `gitUrl` and `credentialId` columns to projects.

**Key files**:
- `packages/core/src/db/schema.ts` (edit — add credentials, jobs tables; modify projects)
- `drizzle/0001_*.sql` (new migration)
- `packages/core/src/db/queries/credentials.ts` (new)
- `packages/core/src/db/queries/jobs.ts` (new)
- `packages/core/src/db/queries/index.ts` (edit — add exports)
- `packages/core/src/domain/types.ts` (edit — add JobStatus, JobType, GitProvider types)

**Details**:

`prism_credentials`:
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| label | text NOT NULL | User-facing name ("My GitHub PAT") |
| provider | text NOT NULL | "github" or "azuredevops" |
| encrypted_token | text NOT NULL | AES-256-GCM encrypted PAT |
| created_at | timestamptz | |
| updated_at | timestamptz | |

`prism_jobs`:
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| project_id | integer FK | References prism_projects |
| type | text NOT NULL | "index" or "blueprint" |
| status | text NOT NULL | "pending", "running", "completed", "failed" |
| options | jsonb | { fullReindex?: boolean, goal?: string, focus?: string } |
| error | text | Error message if failed |
| created_at | timestamptz | |
| started_at | timestamptz | |
| completed_at | timestamptz | |

`prism_projects` additions:
- `git_url text` (nullable — existing CLI-registered projects won't have one)
- `credential_id integer REFERENCES prism_credentials(id) ON DELETE SET NULL`

Job queries should include:
- `createJob(projectId, type, options)` — insert pending job
- `claimNextJob()` — `UPDATE ... SET status='running', started_at=now() WHERE status='pending' ORDER BY created_at LIMIT 1 RETURNING *` (uses `FOR UPDATE SKIP LOCKED` for safety)
- `completeJob(id)` — mark completed
- `failJob(id, error)` — mark failed
- `getJobsByProjectId(projectId)` — list jobs for a project
- `getPendingJobCount()` — for dashboard display

**Verification**:
```bash
npm run build
npx drizzle-kit generate   # should produce migration
npx drizzle-kit migrate    # should apply cleanly
npm test                   # existing tests still pass
```

---

## Milestone 3 — Git Clone Service

**Intent**: Implement clone/cleanup logic with PAT support for GitHub and Azure DevOps HTTPS URLs.

**Key files**:
- `packages/core/src/git/clone.ts` (new)
- `packages/core/src/git/types.ts` (new)
- `packages/core/src/crypto/credentials.ts` (new)
- `packages/core/src/index.ts` (edit — re-export git + crypto modules)
- `test/git/clone.test.ts` (new)
- `test/crypto/credentials.test.ts` (new)

**Details**:

Clone service:
- `cloneRepo(url, destDir, options?)` — runs `git clone --depth 1 <url> <destDir>`
- For private repos, injects PAT into HTTPS URL:
  - GitHub: `https://<PAT>@github.com/org/repo.git`
  - Azure DevOps: `https://<PAT>@dev.azure.com/org/project/_git/repo`
- `cleanupClone(destDir)` — `rm -rf` the clone directory
- Clone destination: `/tmp/prism-clones/<project-id>/`
- `isValidGitUrl(url)` — validate URL format (HTTPS only, no SSH)

Credential encryption:
- `encryptToken(plaintext, key)` → `iv:ciphertext:tag` (hex-encoded)
- `decryptToken(encrypted, key)` → plaintext
- Key from `CREDENTIAL_ENCRYPTION_KEY` env var (32-byte hex)
- Uses Node.js `crypto.createCipheriv('aes-256-gcm', ...)`

**Verification**:
```bash
npm test -- test/git/clone.test.ts
npm test -- test/crypto/credentials.test.ts
```

---

## Milestone 4 — Credential Management UI

**Intent**: Dashboard pages for adding/editing/deleting git PATs, stored encrypted in Postgres.

**Key files**:
- `packages/app/src/dashboard/routes/credentials.ts` (new)
- `packages/app/src/dashboard/views/credentials.ts` (new)
- `packages/app/src/dashboard/server.ts` (edit — register credential routes)

**Routes**:
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/credentials` | List all credentials (label, provider, created date — never show token) |
| POST | `/credentials` | Create new credential (label, provider, token) |
| DELETE | `/credentials/:id` | Delete a credential |

**UI**:
- Credential list page accessible from nav/sidebar
- "Add Credential" form: label (text), provider (select: GitHub/Azure DevOps), PAT (password input)
- Delete button with confirmation
- HTMX form submission (no full page reload)

**Verification**:
```bash
docker compose up -d
# Navigate to http://localhost:3100/credentials
# Add a credential, verify it appears in list
# Delete it, verify removed
npm test
```

---

## Milestone 5 — Job Queue & Worker Process

**Intent**: Background worker process that polls `prism_jobs` and executes indexing/blueprint jobs one at a time.

**Key files**:
- `packages/app/src/worker/index.ts` (new — worker entry point)
- `packages/app/src/worker/executor.ts` (new — job type dispatch)
- `packages/app/src/cli/commands/worker.ts` (new — `prism worker` command)
- `packages/app/src/cli/index.ts` (edit — register worker command)

**Worker design**:
```
while (!shutdown) {
  job = claimNextJob()          // SELECT FOR UPDATE SKIP LOCKED
  if (!job) { sleep(5s); continue }

  if (job.type === "index") {
    project = getProject(job.projectId)
    cloneDir = cloneRepo(project.gitUrl, ...)
    updateProject(project.id, { path: cloneDir })
    runPipeline(project, job.options)
    cleanupClone(cloneDir)
  } else if (job.type === "blueprint") {
    project = getProject(job.projectId)
    generateBlueprints(project.id, ...)
  }

  completeJob(job.id)
}
```

**Key behaviors**:
- Polls every 5 seconds when idle
- One job at a time (no concurrency)
- Graceful shutdown on SIGTERM/SIGINT (finish current job, then exit)
- On job failure: catches error, calls `failJob(id, error.message)`, continues polling
- Temporarily sets `prism_projects.path` to the clone directory during indexing (the pipeline reads from this path)
- After indexing completes, can clear the path or leave it (clone dir will be deleted regardless)

**Verification**:
```bash
# Terminal 1: Start worker
npx prism worker

# Terminal 2: Insert a test job
psql -c "INSERT INTO prism_jobs (project_id, type, status) VALUES (1, 'index', 'pending')"

# Watch Terminal 1 — worker should claim and process the job
npm test
```

---

## Milestone 6 — Web-Triggered Project Creation & Indexing

**Intent**: Dashboard UI to add projects by git URL and trigger indexing/blueprint generation.

**Key files**:
- `packages/app/src/dashboard/routes/overview.ts` (edit — add POST /projects)
- `packages/app/src/dashboard/routes/project.ts` (edit — add POST /projects/:id/index, POST /projects/:id/blueprint)
- `packages/app/src/dashboard/views/index.ts` (edit — add "Add Project" form to overview)
- `packages/app/src/dashboard/views/add-project.ts` (new — project creation form)
- `packages/app/src/dashboard/views/project.ts` (edit — add Index/Blueprint buttons + progress)
- `packages/app/src/dashboard/views/job-progress.ts` (new — HTMX polling fragment)
- `packages/app/src/dashboard/server.ts` (edit — add body parser, register new routes)

**New routes**:
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/projects/new` | "Add Project" form |
| POST | `/projects` | Create project from git URL |
| POST | `/projects/:id/index` | Queue indexing job |
| POST | `/projects/:id/blueprint` | Queue blueprint generation job |
| GET | `/projects/:id/progress` | HTMX fragment: latest job status + index run progress |

**Add Project form**:
- Git URL (text input, required)
- Project name (text input, auto-derived from URL if blank)
- Credential (select dropdown, populated from prism_credentials — "None" for public repos)
- Validate URL format before submission

**Project detail page enhancements**:
- "Index" button (POST to /projects/:id/index)
- "Generate Blueprints" button (POST to /projects/:id/blueprint, with optional goal/focus fields)
- "Re-index" button (same as Index but with `fullReindex: true`)
- Progress section: polls `/projects/:id/progress` every 3s via `hx-trigger="every 3s"` when a job is running
- Shows: current layer, files processed / total, elapsed time, cost

**Verification**:
```bash
docker compose up -d   # web + worker + postgres
# Navigate to http://localhost:3100
# Click "Add Project", paste a public GitHub URL
# Click "Index" on the new project
# Watch progress update in real-time
# After completion, verify files/symbols/findings populated
```

---

## Milestone 7 — Blueprint Export

**Intent**: Download button on the blueprints page to export as markdown or JSON.

**Key files**:
- `packages/app/src/dashboard/routes/export.ts` (new)
- `packages/app/src/dashboard/views/blueprints.ts` (edit — add download buttons)
- `packages/app/src/dashboard/server.ts` (edit — register export routes)

**Routes**:
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/projects/:id/blueprints/export?format=md` | Download all blueprints as markdown |
| GET | `/projects/:id/blueprints/:bid/export?format=md` | Download single blueprint as markdown |
| GET | `/projects/:id/blueprints/:bid/export?format=json` | Download single blueprint as JSON |

**Markdown format**:
```markdown
# Blueprint: {title}

**Subsystem**: {subsystem}
**Model**: {model} | **Cost**: ${costUsd}

## Summary
{summary}

## Proposed Architecture
{proposedArchitecture}

## Module Changes
{moduleChanges formatted as bullet list}

## Migration Path
{migrationPath}

## Risks
{risks formatted as table: risk | impact | mitigation}

## Rationale
{rationale}
```

**UI**:
- "Download All (Markdown)" button at top of blueprints list
- Per-blueprint "Download" dropdown (Markdown / JSON)

**Verification**:
```bash
# With a project that has blueprints generated:
curl -O http://localhost:3100/projects/1/blueprints/export?format=md
# Verify markdown file contents
```

---

## Milestone 8 — Bicep Deployment & Container Entrypoint

**Intent**: Azure infrastructure-as-code and a container entrypoint that runs both web and worker processes.

**Key files**:
- `deploy/main.bicep` (new)
- `deploy/parameters.json` (new)
- `deploy/deploy.sh` (new — wrapper script)
- `entrypoint.sh` (new — starts web + worker)
- `Dockerfile` (edit — update CMD to use entrypoint.sh)

**Entrypoint script** (`entrypoint.sh`):
```bash
#!/bin/bash
# Run migrations
npx drizzle-kit migrate

# Start web server (background)
node packages/app/dist/cli/index.js serve &
WEB_PID=$!

# Start worker (background)
node packages/app/dist/cli/index.js worker &
WORKER_PID=$!

# Forward SIGTERM to both
trap "kill $WEB_PID $WORKER_PID; wait" SIGTERM SIGINT

# Wait for either to exit
wait -n
kill $WEB_PID $WORKER_PID 2>/dev/null
wait
```

**Bicep resources**:
| Resource | SKU/Config |
|----------|-----------|
| Azure Container App Environment | Consumption plan |
| Azure Container App | 1 vCPU, 2 GiB RAM, 1 replica, port 3100 |
| Azure Database for PostgreSQL Flexible Server | Burstable B1ms, pgvector extension |
| Azure Key Vault | Standard, RBAC access |
| Azure Container Registry | Basic (to push the image) |
| Managed Identity | System-assigned on Container App, Key Vault Secrets User role |

**Key Vault secrets**:
- `DATABASE-URL`
- `ANTHROPIC-API-KEY`
- `CREDENTIAL-ENCRYPTION-KEY`
- `SESSION-SECRET`
- `VOYAGE-API-KEY` or `OPENAI-API-KEY`
- Azure Entra ID vars (`AZURE-CLIENT-ID`, `AZURE-CLIENT-SECRET`, `AZURE-TENANT-ID`)

**Deploy flow**:
```bash
# 1. Create resource group
az group create -n rg-prism -l norwayeast

# 2. Deploy infrastructure
az deployment group create \
  -g rg-prism \
  --template-file deploy/main.bicep \
  --parameters @deploy/parameters.json

# 3. Build and push image
az acr build -r <registry> -t prism:latest .

# 4. Update container app with new image
az containerapp update -n prism -g rg-prism --image <registry>.azurecr.io/prism:latest
```

**Verification**:
```bash
# Validate Bicep
az bicep build --file deploy/main.bicep

# Dry-run deployment
az deployment group what-if \
  -g rg-prism \
  --template-file deploy/main.bicep \
  --parameters @deploy/parameters.json

# After deploy: hit the public URL
curl https://prism.<env>.azurecontainerapps.io/login
```

---

## Risks & Unknowns

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Large repos may exceed ephemeral disk (default ~8GB on Container Apps) | Clone fails | Use `git clone --depth 1` (shallow clone); monitor disk; add size guard |
| `prism_projects.path` is used throughout the pipeline as an absolute path | Worker needs to temporarily set path to clone dir | Set path before pipeline, clear after; verify pipeline only reads path at start |
| tree-sitter WASM binaries need to be in the Docker image | Parse failures if missing | Verify `node_modules/tree-sitter-wasms/` is copied in Docker build |
| Worker + web sharing a single Postgres pool in one container | Pool exhaustion under load | Separate pools per process; default pg pool (10 connections) is fine for single-worker |
| AES-256-GCM key rotation | Credentials become unreadable if key changes | Document key management; could add key versioning later |
| Azure DevOps clone URL format varies | Clone failures for some orgs | Test with multiple org structures; document supported URL formats |
| `prism.config.yaml` currently read from cwd | In container, cwd may not have config file | Fall back to defaults + env overrides; optionally mount config as volume |

**Quick probes to resolve**:
1. Test `git clone --depth 1` with a large repo to verify ephemeral disk is sufficient
2. Verify tree-sitter WASM files are found in the dist folder after Docker build
3. Confirm PostgreSQL Flexible Server supports `CREATE EXTENSION vector` on Burstable tier
4. Test the pipeline with a non-cwd project path to confirm it works when `path` is set to `/tmp/prism-clones/X`
