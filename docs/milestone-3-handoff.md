# Milestone 3 — CLI Skeleton + Config — Handoff

## Summary

Implemented the basic CLI skeleton with four commands (init, index, status, serve), YAML config loading with environment variable overrides, domain types/enums, and project CRUD queries.

## Files Created

### @prism/core

- `packages/core/src/domain/types.ts` — All domain enums (IndexStatus, LayerName, SymbolKind, DependencyKind, FindingCategory, FindingSeverity, SummaryLevel) as string-literal union types. Configuration interfaces (StructuralConfig, SemanticConfig, AnalysisConfig, BlueprintConfig, IndexerConfig, DashboardConfig, PrismConfig). Project entity interface.
- `packages/core/src/domain/config.ts` — YAML config loader with `initConfig()`, `getConfig()`, `resetConfig()`. Loads from `prism.config.yaml`, deep-merges with defaults, applies `PRISM_*` environment variable overrides.
- `packages/core/src/domain/index.ts` — Barrel export for domain module.
- `packages/core/src/db/queries/projects.ts` — Project CRUD: createProject, getProject, getProjectByPath, listProjects, updateProject, deleteProject. Uses Drizzle ORM with typed Project mapping.
- `packages/core/src/db/queries/index.ts` — Barrel export for queries module.

### @prism/app

- `packages/app/src/cli/index.ts` — Main CLI entry point using commander. Registers init, index, status, serve sub-commands. Handles cleanup via closeDb().
- `packages/app/src/cli/commands/init.ts` — Register a project for indexing. Resolves path, checks for duplicates, inserts via createProject.
- `packages/app/src/cli/commands/index-cmd.ts` — Stub for indexing pipeline. Validates project registration, accepts --layer and --full options.
- `packages/app/src/cli/commands/status.ts` — Show project status or list all projects. Accepts --all flag.
- `packages/app/src/cli/commands/serve.ts` — Stub for Express+HTMX dashboard. Accepts --port option, falls back to config.

## Files Modified

- `packages/core/package.json` — Added js-yaml dependency, @types/js-yaml devDependency.
- `packages/core/src/index.ts` — Added domain barrel export.
- `packages/core/src/db/index.ts` — Added queries barrel export.
- `packages/app/package.json` — Added commander dependency and bin entry for `prism` CLI.
- `packages/app/src/index.ts` — Added comment noting CLI entry point location.
- `package-lock.json` — Updated with new dependencies.

## Files Removed

- `packages/core/src/domain/.gitkeep` — Replaced by real files.
- `packages/app/src/cli/.gitkeep` — Replaced by real files.

## Dependencies Added

- `js-yaml` ^4.1.1 in @prism/core (YAML parser)
- `@types/js-yaml` ^4.0.9 in @prism/core (devDependency)
- `commander` ^14.0.3 in @prism/app (CLI framework)

## Design Decisions

1. **String-literal unions over TS enums**: Domain "enums" are `type` aliases of string-literal unions rather than TypeScript `enum` constructs. This avoids enum runtime overhead, plays nicely with Drizzle's text columns, and serialises naturally to/from JSON/YAML.

2. **Deep-merge config strategy**: The config loader deep-merges file config onto defaults (objects merge recursively, arrays/primitives overwrite). This means partial YAML files work correctly — only override what you need.

3. **Environment override convention**: `PRISM_<SECTION>_<KEY>` (e.g., `PRISM_DASHBOARD_PORT=4000`). Only known keys are mapped to avoid silent misconfiguration.

4. **CLI commands that need DB are stubs**: The `init`, `index`, `status` commands import DB functions but won't work without PostgreSQL. They compile correctly and will function once a database is available.

5. **Bin entry**: `packages/app/package.json` now has `"bin": { "prism": "dist/cli/index.js" }` so `npx prism` works after build and `npm link`.

## Verification

```bash
npm run build   # ✓ tsc compiles both packages
npm test        # ✓ vitest passes (no test files yet, passWithNoTests: true)
npm run lint    # ✓ type-check passes
```

## Remaining .gitkeep Files

These directories still have .gitkeep and will get real files in later milestones:
- `packages/core/src/indexer/.gitkeep`
- `packages/app/src/dashboard/.gitkeep`
- `packages/app/src/blueprint/.gitkeep`
- `packages/app/src/auth/.gitkeep`
- `prompts/.gitkeep`
- `test/fixtures/.gitkeep`

## Next Milestone

Milestone 4 should implement the structural indexing layer (tree-sitter parsing, file walking, symbol extraction).
