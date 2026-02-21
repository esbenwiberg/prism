# Milestone 3 Handoff: Git Clone Service

## Status: Complete

## What was delivered

### Credential Encryption (`packages/core/src/crypto/credentials.ts`)
- `encryptToken(plaintext, hexKey)` -- AES-256-GCM encryption, returns `iv:ciphertext:tag` (hex-encoded)
- `decryptToken(encrypted, hexKey)` -- decrypts the above format back to plaintext
- Key validation: requires 64-character hex string (32 bytes)
- Uses 96-bit random IV per encryption (GCM best practice)
- 128-bit authentication tag for tamper detection

### Git Clone Service (`packages/core/src/git/clone.ts`, `packages/core/src/git/types.ts`)
- `cloneRepo(url, destDir, options?)` -- shallow clone via `git clone --depth 1`
- `cleanupClone(destDir)` -- `rm -rf` with graceful failure
- `isValidGitUrl(url)` -- validates HTTPS-only URLs, rejects SSH/file/HTTP
- `injectPat(url, pat, provider)` -- PAT injection into HTTPS URLs
  - GitHub: `https://<PAT>@github.com/org/repo.git`
  - Azure DevOps: `https://<PAT>@dev.azure.com/org/project/_git/repo`
- `cloneDestination(projectId)` -- builds `/tmp/prism-clones/<id>` path
- PAT redaction in all log output and error messages
- 5-minute timeout on git commands

### Types (`packages/core/src/git/types.ts`)
- `CloneOptions` -- optional PAT, provider, depth
- `CloneResult` -- destDir, redacted URL
- `CLONE_BASE_DIR` constant (`/tmp/prism-clones`)

### Barrel Exports (`packages/core/src/index.ts`)
- Added re-exports for `crypto/credentials`, `git/types`, `git/clone`

## Tests

- `test/crypto/credentials.test.ts` -- 13 tests covering round-trip, format validation, wrong key, tampered data, key validation
- `test/git/clone.test.ts` -- 28 tests covering URL validation, PAT injection, clone args, error redaction, cleanup

## Verification

```
npm test -- test/crypto/credentials.test.ts  # 13 passed
npm test -- test/git/clone.test.ts           # 28 passed
npm run build                                 # clean
npm run lint                                  # clean
```

## Files changed

| File | Action |
|------|--------|
| `packages/core/src/crypto/credentials.ts` | New |
| `packages/core/src/git/clone.ts` | New |
| `packages/core/src/git/types.ts` | New |
| `packages/core/src/index.ts` | Modified (3 lines added) |
| `test/crypto/credentials.test.ts` | New |
| `test/git/clone.test.ts` | New |

## Integration notes for downstream milestones

- The `createCredential` query (from milestone 2) expects `encryptedToken` as input. Call `encryptToken(pat, key)` before passing to `createCredential`.
- The `CREDENTIAL_ENCRYPTION_KEY` env var must be set (64-char hex, 32 bytes) for production use.
- `cloneRepo` uses `execFile` (not `exec`) to avoid shell injection.
- Clone destinations are ephemeral in `/tmp/prism-clones/` -- call `cleanupClone()` after indexing completes.
- The worker process (milestone 4+) should: decrypt token -> clone repo -> run indexer -> cleanup clone.
