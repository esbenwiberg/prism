# Milestone 8 Handoff — Layers 4+5: Analysis + Blueprints

## Summary

Implemented the final two layers of the Prism five-layer pipeline:

- **Layer 4 (Analysis)**: Hierarchical summary rollup, pattern detection with 5 detectors, and gap analysis comparing documentation intent with code reality.
- **Layer 5 (Blueprints)**: Blueprint generator that feeds complete codebase understanding to Claude Sonnet to produce structured redesign proposals.

## What Was Built

### Analysis (Layer 4) — `packages/core/src/indexer/analysis/`

| File | Purpose |
|------|---------|
| `rollup.ts` | Hierarchical summary rollup: file -> module -> system summaries using Claude Sonnet |
| `patterns.ts` | Pattern detection orchestrator: runs all detectors, persists findings |
| `gap-analysis.ts` | Compares documentation intent with code reality to find discrepancies |
| `detectors/god-modules.ts` | Detects files with high fan-in AND fan-out (god modules) |
| `detectors/layering.ts` | Detects cross-layer import violations based on directory structure |
| `detectors/coupling.ts` | Detects files exceeding coupling/cohesion thresholds |

### Blueprint (Layer 5) — `packages/app/src/blueprint/`

| File | Purpose |
|------|---------|
| `types.ts` | Blueprint domain types: BlueprintProposal, Risk, ModuleChange, GapFinding |
| `generator.ts` | Feeds summaries + findings to Claude Sonnet for redesign proposals |
| `splitter.ts` | Groups findings by subsystem for focused per-subsystem blueprint generation |

### CLI Commands — `packages/app/src/cli/commands/`

| File | Purpose |
|------|---------|
| `analyze.ts` | `prism analyze <project>` — runs Layer 4 |
| `blueprint-cmd.ts` | `prism blueprint <project>` — runs Layer 5 |

### Dashboard — `packages/app/src/dashboard/`

| File | Purpose |
|------|---------|
| `routes/blueprints.ts` | GET /projects/:id/blueprints |
| `routes/graph.ts` | GET /projects/:id/graph + GET /api/projects/:id/graph (JSON for D3) |
| `routes/modules.ts` | GET /projects/:id/modules |
| `views/blueprints.ts` | Blueprint proposals view with module changes, risks, and rationale |
| `views/graph.ts` | Interactive D3 dependency graph page |
| `views/modules.ts` | Module overview with summaries and metrics |
| `public/graph.js` | Client-side D3 force-directed graph rendering |

### Prompt Templates — `prompts/`

| File | Purpose |
|------|---------|
| `summarize-file.md` | File-level summary from symbol summaries |
| `summarize-module.md` | Module-level summary from file summaries |
| `summarize-system.md` | System-level summary from module summaries |
| `gap-analysis.md` | Compare docs intent vs code reality |
| `blueprint.md` | Generate redesign proposals |

### Database Queries — `packages/core/src/db/queries/`

| File | Purpose |
|------|---------|
| `blueprints.ts` | CRUD operations for prism_blueprints table |
| `summaries.ts` | Added `getSummariesByLevel()` for level-filtered queries |

## Key Design Decisions

1. **Analysis and blueprint are separate CLI commands** (`prism analyze`, `prism blueprint`) — not part of `prism index`. The analysis layer IS wired into the pipeline for `prism index` with the `analysis` layer, but `blueprint` is skipped in pipeline and only runs via `prism blueprint`.

2. **Rollup hierarchy**: function summaries (from semantic layer) -> file summaries -> module summaries -> system summary. Each level calls Claude Sonnet.

3. **Pattern detectors** are pure functions that take data and return findings. The orchestrator (`patterns.ts`) loads data from DB and runs all detectors.

4. **Blueprint generation** can be per-subsystem (when there are many findings across different areas) or whole-project. The splitter groups findings by their evidence file paths matching module summaries.

5. **D3 graph** uses a force-directed layout with node coloring by module, node sizing by complexity, and zoom/pan/drag interactions. Graph data is served as JSON via a separate API endpoint.

## Modifications to Existing Files

- `packages/core/src/indexer/pipeline.ts` — Added `executeAnalysisLayer()`, wired analysis into the pipeline switch, added imports for analysis modules
- `packages/core/src/indexer/index.ts` — Added barrel exports for new analysis modules
- `packages/core/src/indexer/analysis/detectors/index.ts` — Added exports for new detectors
- `packages/core/src/db/queries/index.ts` — Added blueprint queries and `getSummariesByLevel`
- `packages/core/src/db/queries/summaries.ts` — Added `getSummariesByLevel()` function
- `packages/app/src/cli/index.ts` — Registered `analyze` and `blueprint` commands
- `packages/app/src/dashboard/server.ts` — Registered blueprint, graph, and modules routes
- `packages/app/src/dashboard/views/index.ts` — Added barrel exports for new views
- `packages/app/src/dashboard/views/project.ts` — Added navigation links to modules, blueprints, and graph
- `packages/app/src/index.ts` — Added barrel exports for blueprint types and generator

## Test Results

- **236 tests passing** (55 new tests added)
- New test files:
  - `detectors/god-modules.test.ts` — 8 tests
  - `detectors/layering.test.ts` — 13 tests
  - `detectors/coupling.test.ts` — 9 tests
  - `gap-analysis.test.ts` — 10 tests
  - `blueprint/splitter.test.ts` — 6 tests
  - `blueprint/generator.test.ts` — 9 tests

## Files Removed

- `packages/app/src/blueprint/.gitkeep` — replaced with real files
- `prompts/.gitkeep` — replaced with real prompt templates

## Usage

```bash
# Index the project (layers 1-3)
prism index /path/to/project

# Run analysis (layer 4: rollup + pattern detection + gap analysis)
prism analyze <project-id-or-path>

# Generate blueprints (layer 5: redesign proposals)
prism blueprint <project-id-or-path>

# View results in dashboard
prism serve
```
