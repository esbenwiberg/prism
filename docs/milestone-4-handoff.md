# Milestone 4 Handoff: Credential Management UI

## Summary

Dashboard pages for adding, listing, and deleting git PATs (Personal Access Tokens). Tokens are encrypted with AES-256-GCM before storage and are never exposed in the UI.

## What Was Built

### New Files

- **`packages/app/src/dashboard/views/credentials.ts`** -- Credential list page view with "Add Credential" form. Renders table showing label, provider, and created date. Delete button with confirmation. HTMX form submission (no full page reload).

- **`packages/app/src/dashboard/routes/credentials.ts`** -- Express routes for credential CRUD:
  - `GET /credentials` -- List all credentials (label, provider, created date)
  - `POST /credentials` -- Create new credential (encrypts PAT before storage)
  - `DELETE /credentials/:id` -- Delete a credential

### Modified Files

- **`packages/app/src/dashboard/server.ts`** -- Registered `credentialsRouter`, added `express.urlencoded()` middleware for POST form body parsing.

- **`packages/app/src/dashboard/views/layout.ts`** -- Added "Credentials" nav item to the default sidebar navigation.

- **`packages/app/src/dashboard/views/index.ts`** -- Added barrel exports for credential view functions and types.

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/credentials` | List all credentials (label, provider, created date -- never show token) |
| POST | `/credentials` | Create new credential (label, provider, token encrypted via AES-256-GCM) |
| DELETE | `/credentials/:id` | Delete a credential |

## Security

- PATs are encrypted using `encryptToken()` from `@prism/core` with the `CREDENTIAL_ENCRYPTION_KEY` env var before being stored
- Decrypted tokens are **never** sent to the browser
- The PAT input field uses `type="password"` to mask input
- The `CREDENTIAL_ENCRYPTION_KEY` env var is validated before use; a clear error is returned if missing

## UI Details

- Credential list table: Label, Provider (badge), Created date, Delete button
- "Add Credential" form: label (text input), provider (select: GitHub/Azure DevOps), PAT (password input)
- Delete button with `hx-confirm` dialog
- HTMX-based form submission (partial page update via `hx-target="#main-content"`)
- Flash messages shown after create/delete operations
- "Credentials" link in the sidebar navigation

## Dependencies from Prior Milestones

- **Milestone 2**: `prism_credentials` table, `createCredential`, `listCredentials`, `deleteCredential` queries from `@prism/core`
- **Milestone 3**: `encryptToken` from `@prism/core` for AES-256-GCM encryption

## Verification

```bash
npm run build   # Compiles successfully
npm test        # All 303 tests pass (24 test files)
```

## What's Next (Milestone 5+)

The credential management UI is ready for use by the repository management UI, which will allow users to select a credential when adding a repository by URL.
