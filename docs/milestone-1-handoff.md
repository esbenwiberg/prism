# Milestone 1 Handoff — Monorepo Scaffolding

## Key Files Created

| File | Purpose |
|------|---------|
| `package.json` | Root workspace config, scripts: build/test/lint |
| `tsconfig.base.json` | Shared TypeScript compiler options (strict, ESM Node16) |
| `tsconfig.json` | Root project references for lint/build |
| `packages/core/package.json` | @prism/core package (depends on pino ^9.6.0) |
| `packages/core/tsconfig.json` | Core TS config (extends base, outDir: dist) |
| `packages/core/src/index.ts` | Core barrel export (re-exports logger) |
| `packages/core/src/logger.ts` | Pino logger singleton |
| `packages/app/package.json` | @prism/app package (depends on @prism/core) |
| `packages/app/tsconfig.json` | App TS config (extends base, references core) |
| `packages/app/src/index.ts` | App barrel export (re-exports logger from core) |
| `vitest.config.ts` | Test runner config (passWithNoTests: true) |
| `prism.config.yaml` | Pipeline defaults (skip patterns, model config, ports) |
| `.env.example` | Environment variable template |
| `.gitignore` | Ignores dist/, *.tsbuildinfo, .env, node_modules, etc. |
| `CLAUDE.md` | Project conventions and instructions |

## Exports Available

### @prism/core
- `logger` — Pino logger instance (`pino.Logger`), reads `LOG_LEVEL` env var, defaults to "info"

### @prism/app
- Re-exports `logger` from `@prism/core`

## Directory Scaffolding (empty, ready for future milestones)

- `packages/core/src/indexer/` — Pipeline engine (milestone 2+)
- `packages/core/src/db/` — Drizzle schema, connection, queries (milestone 2)
- `packages/core/src/domain/` — Domain types, config loader (milestone 2)
- `packages/app/src/cli/` — Commander CLI (milestone 6)
- `packages/app/src/dashboard/` — Express+HTMX dashboard (milestone 7)
- `packages/app/src/blueprint/` — Blueprint generator (milestone 5)
- `packages/app/src/auth/` — Entra ID auth (milestone 7)
- `prompts/` — LLM prompt templates
- `drizzle/` — Generated migrations
- `test/fixtures/` — Integration test fixtures

## Patterns Established

1. **ESM throughout** — `"module": "Node16"` in tsconfig, `.js` extensions in imports
2. **Composite builds** — Each package uses `tsc --build`, root uses `--workspaces`
3. **Project references** — `@prism/app` references `@prism/core` via `tsconfig.json`
4. **Workspace linking** — `@prism/core: "*"` in app's dependencies
5. **Pino logging** — All logging goes through the singleton from `@prism/core`
6. **Config pattern** — `prism.config.yaml` for defaults, env vars for overrides

## Environment Notes

- This environment has `NODE_ENV=production` set globally. Running `npm install` requires `NODE_ENV=development` to install devDependencies (typescript, vitest, @types/node).
- The runtime is Node.js v20.20.0 (engine spec says >=22 but works fine on 20).

## Commands

```bash
NODE_ENV=development npm install   # Install all deps including dev
npm run build                       # tsc compiles both packages
npm test                            # vitest (no tests yet, exits clean)
npm run lint                        # tsc --build --noEmit (type check only)
```

## Suggested Amendments for Future Milestones

- Milestone 2 (DB schema) should add `drizzle-orm` and `drizzle-kit` to @prism/core dependencies
- Milestone 2 should add a config loader in `packages/core/src/domain/config.ts` that reads `prism.config.yaml`
- Consider adding `pino-pretty` as a devDependency for development logging
