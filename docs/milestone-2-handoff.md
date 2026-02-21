# Milestone 2 Handoff: Schema Evolution

## What was done

Added database tables for credentials and jobs. Extended `prism_projects` with `git_url` and `credential_id` columns. Added domain types for job status, job type, and git provider. Preserved and incorporated the pre-existing blueprint table restructuring (plans, phases, milestones).

## Files created

| File | Purpose |
|------|---------|
| `packages/core/src/db/queries/credentials.ts` | CRUD operations for `prism_credentials` table |
| `packages/core/src/db/queries/jobs.ts` | Job queue operations with atomic `claimNextJob()` |
| `drizzle/0002_add_credentials_and_jobs.sql` | Migration: credentials table, jobs table, projects columns |

## Files modified

| File | Changes |
|------|---------|
| `packages/core/src/db/schema.ts` | Added `credentials`, `jobs` tables; added `gitUrl`, `credentialId` to `projects` |
| `packages/core/src/domain/types.ts` | Added `JobStatus`, `JobType`, `GitProvider` types; extended `Project` interface |
| `packages/core/src/db/queries/projects.ts` | Updated `toProject` mapper and `updateProject` to include `gitUrl`/`credentialId` |
| `packages/core/src/db/queries/index.ts` | Added barrel exports for credentials and jobs modules |
| `drizzle/meta/_journal.json` | Added entry for migration 0002 |

## Key exports available

### From `@prism/core`

**Types:**
- `JobStatus` — `"pending" | "running" | "completed" | "failed"`
- `JobType` — `"index" | "blueprint"`
- `GitProvider` — `"github" | "azuredevops"`
- `JobRow` — Drizzle inferred row type for `prism_jobs`
- `JobOptions` — `{ fullReindex?: boolean; goal?: string; focus?: string }`
- `CredentialRow` — Drizzle inferred row type for `prism_credentials`
- `CreateCredentialInput` — `{ label, provider, encryptedToken }`
- `Project` — Now includes `gitUrl: string | null` and `credentialId: number | null`

**Functions:**
- `createCredential(input)` — Insert a credential with encrypted token
- `getCredential(id)` — Fetch by ID
- `listCredentials()` — List all credentials
- `updateCredential(id, updates)` — Partial update
- `deleteCredential(id)` — Delete by ID
- `createJob(projectId, type, options?)` — Insert a pending job
- `claimNextJob()` — Atomically claim next pending job (`FOR UPDATE SKIP LOCKED`)
- `completeJob(id)` — Mark job completed
- `failJob(id, error)` — Mark job failed with error message
- `getJobsByProjectId(projectId)` — List jobs for a project
- `getPendingJobCount()` — Count pending jobs

**Schema tables:**
- `credentials` — `prism_credentials` Drizzle table reference
- `jobs` — `prism_jobs` Drizzle table reference

## Database schema additions

### prism_credentials
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| label | text NOT NULL | User-facing name |
| provider | text NOT NULL | "github" or "azuredevops" |
| encrypted_token | text NOT NULL | AES-256-GCM encrypted PAT |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### prism_jobs
| Column | Type | Notes |
|--------|------|-------|
| id | serial PK | |
| project_id | integer FK | References prism_projects, CASCADE delete |
| type | text NOT NULL | "index" or "blueprint" |
| status | text NOT NULL | Default "pending" |
| options | jsonb | { fullReindex?, goal?, focus? } |
| error | text | Error message if failed |
| created_at | timestamptz | |
| started_at | timestamptz | |
| completed_at | timestamptz | |

### prism_projects (new columns)
| Column | Type | Notes |
|--------|------|-------|
| git_url | text | Nullable for CLI-registered projects |
| credential_id | integer FK | References prism_credentials, SET NULL on delete |

## Patterns established

1. **Job queue pattern**: `claimNextJob()` uses raw SQL with `FOR UPDATE SKIP LOCKED` for safe concurrent polling. Worker should call this in a loop with a sleep interval.
2. **Credential storage**: Tokens are stored pre-encrypted. The encryption/decryption layer (AES-256-GCM using `CREDENTIAL_ENCRYPTION_KEY` env var) should be implemented in `packages/core/src/crypto/` (Milestone 3).
3. **Raw SQL via Drizzle**: Use `db.execute(sql\`...\`)` with `results.rows` for queries that need PostgreSQL features not supported by the Drizzle query builder (e.g., `FOR UPDATE SKIP LOCKED`).

## Utilities available for reuse

- `getDb()` from `packages/core/src/db/connection.ts` — Shared database connection singleton
- All query functions follow the same pattern: get `db` via `getDb()`, use Drizzle query builder, return typed rows

## Amendments suggested for future milestones

- **Milestone 3** (Git clone + credential encryption): The `createCredential` function expects `encryptedToken` as input. The crypto module should encrypt the PAT before calling `createCredential`.
- **Milestone 4** (Worker): Use `claimNextJob()` in a polling loop. The `JobOptions` type already supports `fullReindex`, `goal`, and `focus` fields for both index and blueprint job types.
- The `Project` interface and `updateProject` function now support `gitUrl` and `credentialId`, ready for the dashboard repo-add flow.
