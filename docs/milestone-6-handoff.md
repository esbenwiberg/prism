# Milestone 6 Handoff: Dashboard MVP

## Summary

Implemented the Express+HTMX dashboard with project overview, file browser, findings view, Azure Entra ID auth, and two graph analysis detectors (circular dependencies and dead code).

## What was built

### Graph Analysis Detectors (`packages/core/src/indexer/analysis/detectors/`)

- **circular-deps.ts** -- Tarjan's algorithm for finding strongly connected components in the file dependency graph. Detects circular dependency chains and creates findings with severity based on cycle length (low: 2, medium: 3-5, high: >5).
- **dead-code.ts** -- Identifies exported symbols with zero inbound references from other files. Groups findings by file with appropriate severity levels.
- **index.ts** -- Barrel export for detectors.
- 26 tests covering both detectors (16 for circular-deps, 10 for dead-code).

### Auth Module (`packages/app/src/auth/`)

- **entra.ts** -- Azure Entra ID OAuth2 via `@azure/msal-node`. Provides `getAuthUrl()` and `handleCallback()` for the OAuth flow. Requires `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` env vars.
- **session.ts** -- Express session middleware setup with `express-session`. Reads `SESSION_SECRET` from env.
- **middleware.ts** -- `requireAuth()` middleware that checks session for authenticated user. Supports `SKIP_AUTH=true` env var for development bypass.

### Dashboard Views (`packages/app/src/dashboard/views/`)

All views are pure functions returning HTML strings (no template engine).

- **components.ts** -- `escapeHtml`, `badge`, `card`, `statCard`, `table`, `severityBadge`, `statusBadge` helpers.
- **layout.ts** -- Page shell with sidebar navigation, topbar with user info, main content area. Includes HTMX CDN link.
- **overview.ts** -- Projects list page with status badges.
- **project.ts** -- Single project detail with stat cards (files, symbols, findings) and nav to files/findings.
- **files.ts** -- File browser with complexity/coupling/cohesion metric badges and type tags.
- **findings.ts** -- Findings list with severity filter bar and category badges.

### Dashboard Routes (`packages/app/src/dashboard/routes/`)

- **overview.ts** -- `GET /` -- Lists all projects.
- **project.ts** -- `GET /projects/:id` -- Project detail page.
- **files.ts** -- `GET /projects/:id/files` -- File browser.
- **findings.ts** -- `GET /projects/:id/findings` -- Findings list with `?severity=` filter.

All routes support HTMX partial updates (check `hx-request` header) and full page renders.

### Dashboard Server (`packages/app/src/dashboard/server.ts`)

Express application with:
- Session middleware
- Static file serving (`/public`)
- Auth routes: `GET /login`, `GET /auth/callback`, `GET /logout`
- Protected routes behind `requireAuth` middleware
- `startServer(port)` function to start listening

### Public Assets (`packages/app/src/dashboard/public/`)

- **htmx-ext.js** -- Loading indicator and page title update handlers.

### Database Queries (`packages/core/src/db/queries/findings.ts`)

- `bulkInsertFindings`, `getFindingsByProjectId`, `getFindingsByProjectIdAndSeverity`, `deleteFindingsByProjectId`, `countFindingsByProjectId`

### Updated Files

- **packages/app/src/cli/commands/serve.ts** -- Now imports and calls `startServer()` from the dashboard module (was a stub).
- **packages/app/src/index.ts** -- Added dashboard and auth exports.
- **packages/core/src/indexer/index.ts** -- Added detector exports.
- **packages/core/src/db/queries/index.ts** -- Added findings query exports.
- **packages/app/package.json** -- Added express, express-session, @azure/msal-node dependencies.

### Removed Files

- `packages/app/src/auth/.gitkeep` -- Replaced with real auth modules.
- `packages/app/src/dashboard/.gitkeep` -- Replaced with real dashboard modules.

## Dependencies Added

- `express` ^5.2.1
- `express-session` ^1.19.0
- `@azure/msal-node` ^5.0.4
- `@types/express` ^5.0.6 (dev)
- `@types/express-session` ^1.18.2 (dev)

## Verification

- `npm run build` -- passes (tsc compiles all new files)
- `npm test` -- 142 tests pass (11 test files, 26 new detector tests)

## Environment Variables for Dashboard

| Variable | Required | Description |
|---|---|---|
| `SKIP_AUTH` | No | Set to `"true"` to bypass auth in development |
| `AZURE_CLIENT_ID` | For auth | Azure Entra ID application client ID |
| `AZURE_CLIENT_SECRET` | For auth | Azure Entra ID client secret |
| `AZURE_TENANT_ID` | For auth | Azure Entra ID tenant ID |
| `AZURE_REDIRECT_URI` | No | OAuth callback URL (default: `http://localhost:3100/auth/callback`) |
| `SESSION_SECRET` | No | Express session secret (default: dev-only value) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |

## Known Limitations

- Session store uses in-memory MemoryStore (adequate for MVP, should use `connect-pg-simple` for production).
- No pagination on file/findings tables (fine for small-to-medium projects).
- HTMX CDN loaded from unpkg.com (requires internet access).
- `htmx-ext.js` is a static JS file not a TypeScript source -- needs to be copied to `dist/` during deployment.

## What's Next

- Milestone 7: Semantic layer (LLM summaries and embeddings)
- Milestone 8: Blueprint generation
