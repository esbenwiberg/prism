# Milestone 4 Handoff: Layer 1 — Structural Indexing (tree-sitter)

## Summary

Implemented the structural indexing layer (Layer 1) of the five-layer pipeline. This is the core of the tool: it parses every file with tree-sitter, extracts symbols, builds a dependency graph, computes metrics, and supports incremental re-indexing.

## Files Created

### Indexer Types & Pipeline
- `packages/core/src/indexer/types.ts` — IndexContext, LayerResult, BudgetTracker, FileEntry, ExtractedSymbol, DependencyEdge, FileMetrics, StructuralFileResult, SupportedLanguage
- `packages/core/src/indexer/pipeline.ts` — Pipeline orchestrator: file walking (skipPatterns, maxFileSizeBytes), SHA-256 hashing, incremental indexing via git diff, batch processing, structural layer coordination
- `packages/core/src/indexer/index.ts` — Barrel export for the indexer module

### Structural Sub-modules
- `packages/core/src/indexer/structural/languages.ts` — Language detection from file extension (.ts/.tsx/.js/.jsx/.mjs/.cjs/.py/.cs), grammar registry mapping to tree-sitter-wasms
- `packages/core/src/indexer/structural/parser.ts` — web-tree-sitter init, grammar loading from .wasm files (cached per language), AST parsing
- `packages/core/src/indexer/structural/extractor.ts` — Symbol extraction from AST: functions, classes, interfaces, types, enums, exports, imports. Language-aware for TS/JS, Python, and C#
- `packages/core/src/indexer/structural/graph.ts` — Dependency graph builder: extracts import/export/require statements, resolves relative imports (with .js->.ts extension probing, index file probing), Python dotted module resolution
- `packages/core/src/indexer/structural/metrics.ts` — Cyclomatic complexity (decision node counting), efferent/afferent coupling, cohesion ratio

### DB Query Modules
- `packages/core/src/db/queries/files.ts` — File upsert, hash check (fileNeedsReindex), bulk operations
- `packages/core/src/db/queries/symbols.ts` — Bulk insert/delete symbols per file
- `packages/core/src/db/queries/dependencies.ts` — Dependency edge insert/delete
- `packages/core/src/db/queries/index-runs.ts` — Index run lifecycle: create, update progress, complete, fail

### Test Files (44 tests, all passing)
- `packages/core/src/indexer/types.test.ts` — BudgetTracker tests
- `packages/core/src/indexer/structural/languages.test.ts` — Language detection tests (13)
- `packages/core/src/indexer/structural/extractor.test.ts` — Symbol extraction tests for TS, Python, JS (13)
- `packages/core/src/indexer/structural/graph.test.ts` — Dependency resolution tests (7)
- `packages/core/src/indexer/structural/metrics.test.ts` — Complexity and metrics tests (8)

## Files Modified

- `packages/core/package.json` — Added web-tree-sitter@0.24.3, tree-sitter-wasms@0.1.13
- `packages/core/src/db/queries/index.ts` — Added exports for files, symbols, dependencies, index-runs
- `packages/core/src/index.ts` — Added indexer module barrel export
- `packages/app/src/cli/commands/index-cmd.ts` — Updated from stub to call runPipeline()
- `packages/core/src/indexer/.gitkeep` — Removed (replaced with real files)
- `package-lock.json` — Updated with new dependencies

## Key Decisions

1. **web-tree-sitter 0.24.3** (not 0.26.x): The tree-sitter-wasms@0.1.13 grammars use an older ABI format incompatible with web-tree-sitter 0.26.x. Version 0.24.3 uses `export = Parser` pattern with `Parser.Language`, `Parser.SyntaxNode`, `Parser.Tree` namespaced types.

2. **Incremental indexing strategy**: First tries git diff for changed file detection, then falls back to SHA-256 content hash comparison per file.

3. **Import resolution**: JS/TS imports support `.js` -> `.ts` extension remapping (ESM convention), index file probing, and relative path normalization. Python supports dotted module -> path conversion. C# using directives are tracked but not resolved to files (namespace-based).

4. **Metrics model**: Cyclomatic complexity counts decision nodes (if/else/for/while/switch/catch/ternary/&&/||/??). Coupling is efferent (files this file imports) + afferent (files that import this file). Cohesion is a ratio of external dependencies to total symbols.

## Dependencies Added

- `web-tree-sitter@0.24.3` — WASM-based tree-sitter runtime for Node.js
- `tree-sitter-wasms@0.1.13` — Pre-built .wasm grammars for TS, TSX, JS, Python, C#

## Verification

```
npm run build   # passes
npm test        # 44 tests, all passing
npm run lint    # passes (tsc --build --noEmit)
```

## What's Next

- Milestone 5: Layer 2 — Documentation indexing
- Milestone 6: Layer 3 — Semantic indexing (embeddings)
- The pipeline orchestrator already has placeholder handling for docs/semantic/analysis/blueprint layers
