# Onboarding Guide

Welcome to GoldenApp! This guide will help you understand the codebase and start contributing.

## Module Overview

The code lives in `src/` and is organized into four top-level modules:

### `auth/` — Authentication
- **auth-service.ts** — Main auth orchestrator. Handles login, logout, token refresh, and authorization. This is the highest-coupling module in the codebase — it coordinates between session storage, token validation, and middleware.
- **token-validator.ts** — Pure validation functions for JWT tokens. Zero dependencies, highly testable. Start here if you want to understand our token format.
- **session-store.ts** — CRUD operations for server-side sessions. Backed by the database via `db/connection.ts`.

### `db/` — Database Layer
- **connection.ts** — Connection pool management. This is core infrastructure — many modules depend on it. Changes here have a high blast radius.
- **user-repository.ts** — Data access for the `users` table. Uses `connection.ts` for queries.
- **models.ts** — TypeScript types and interfaces only. No logic, no imports. Safe to modify.

### `api/` — HTTP Layer
- **routes.ts** — Maps HTTP methods and paths to handler functions. Note: this file imports directly from both `auth/` and `db/`, which is a layering violation we plan to fix.
- **middleware.ts** — Request preprocessing (auth, CORS, rate limiting). Has a circular dependency with `auth-service.ts` that needs resolution.
- **handlers.ts** — Request handler functions. This is our "god module" — it has 15+ exported functions and high cyclomatic complexity. Splitting it is on the roadmap.

### `utils/` — Shared Utilities
- **logger.ts** — Application logging. Imported widely across the codebase.
- **helpers.ts** — Formatting and validation helpers. Some exports are used (`formatDate`), others are not (`unusedHelper`).
- **dead-code.ts** — Legacy utilities that are no longer imported anywhere. Candidate for removal.

## Dependency Flow

```
index.ts
├── db/connection.ts ← utils/logger.ts
├── api/routes.ts ← auth/auth-service.ts, db/user-repository.ts
├── api/middleware.ts ←→ auth/auth-service.ts (circular!)
└── utils/logger.ts
```

## Development Workflow

1. Clone the repo
2. Run `npm install`
3. Copy `.env.example` to `.env` and fill in your database credentials
4. Run `npm run build` to compile TypeScript
5. Run `npm start` to launch the server

## Things to Watch Out For

- **Circular dependency**: `middleware.ts` and `auth-service.ts` import each other. Be careful when modifying either.
- **God module**: `handlers.ts` keeps growing. If you need to add a new handler, consider whether it's time to split this file.
- **Dead code**: `dead-code.ts` is not imported anywhere. Don't add new utilities there.
- **Blast radius**: Changes to `connection.ts` affect almost everything. Test thoroughly.
