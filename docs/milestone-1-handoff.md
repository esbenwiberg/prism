# Milestone 1 Handoff: Dockerfile & Docker Compose

## Summary

Containerized the existing Prism app so it can run locally via `docker compose up`. The dashboard starts on port 3100 with SKIP_AUTH=true, backed by Postgres 16 with pgvector.

## Key Files Created

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build: node:22-slim base, build stage compiles TS, production stage runs with minimal deps |
| `docker-compose.yml` | Prism web service (port 3100) + Postgres 16 with pgvector (pgvector/pgvector:pg16) |
| `entrypoint.sh` | Container startup: wait for Postgres, enable pgvector extension, run drizzle-kit migrate, start dashboard |
| `.dockerignore` | Excludes node_modules, dist, .env, .git, tests, docs from build context |
| `.env.example` (updated) | Added SKIP_AUTH and CREDENTIAL_ENCRYPTION_KEY variables |

## Patterns Established

### Docker Build Pattern
- **Build stage**: `npm ci` installs all deps (including devDeps for TypeScript compilation), `npm run build` compiles both @prism/core and @prism/app via workspace project references.
- **Production stage**: `npm ci --omit=dev` for runtime deps only, then `npm install --no-save drizzle-kit@0.30.6` for migration support. Compiled dist is copied from the build stage.
- **Static assets**: `packages/app/src/dashboard/public/` is manually copied to `packages/app/dist/dashboard/public/` because tsc does not emit non-TS files.

### Entrypoint Pattern
- Uses `node -e` with the `pg` driver (already a runtime dependency) to wait for Postgres readiness and enable the pgvector extension.
- Runs `npx drizzle-kit migrate` for database migrations.
- Uses `exec` to replace the shell process with the Node.js server (`node packages/app/dist/cli/index.js serve`).

### Docker Compose Pattern
- Postgres healthcheck uses `pg_isready -U prism -d prism`.
- Prism service depends on Postgres with `condition: service_healthy`.
- Prism healthcheck: `curl -sf http://localhost:3100/login` (returns 302 with SKIP_AUTH=true).
- Optional `.env` file loaded with `required: false`.
- Named volume `pgdata` for Postgres data persistence.

### Environment Variables in Compose
- `DATABASE_URL`: Connection string pointing to the compose Postgres service.
- `SKIP_AUTH=true`: Bypasses Entra ID auth for local development.
- `SESSION_SECRET`: Set to a local dev value (overridable via `.env`).
- Additional API keys (ANTHROPIC_API_KEY, etc.) can be set via `.env` file.

## Utilities Available for Reuse

- The entrypoint.sh Postgres wait loop and pgvector enable patterns can be reused or extended for worker processes in future milestones.
- The Docker Compose env_file pattern allows overriding defaults with a local `.env` without requiring it to exist.

## Known Issues / Notes

- `drizzle/meta/` is in `.gitignore` but is needed by `drizzle-kit migrate`. The Docker build works from a local checkout (where the directory exists on disk), but a fresh git clone would lack this directory. This is a pre-existing issue unrelated to milestone 1.
- The Dockerfile installs `git` and `curl` in the production image. Git is needed for cloning repos (future milestones); curl is needed for the Docker healthcheck.

## Verification

```bash
docker compose build           # Builds successfully
docker compose up -d           # Starts both services
curl -s http://localhost:3100/login  # Returns 302 (redirect to /)
docker compose ps              # Both containers show as "healthy"
docker compose down            # Clean shutdown
```

## Amendments for Future Milestones

- **Milestone 2 (worker process)**: The entrypoint.sh can be extended to start both the web server and a worker process. Consider using a process manager or a second entrypoint.
- **Milestone 3+ (git clone)**: The `/tmp/prism-clones/` directory is already created in the Dockerfile. Future milestones can mount it as a volume if persistence is needed across restarts.
- **CI/CD**: Consider adding `drizzle/meta/` to git tracking (remove from `.gitignore`) so Docker builds work from fresh clones.
