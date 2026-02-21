# Hive + Prism Integration — Future Blueprint

## Goal

Integrate `@prism/core` into Hive to replace/enhance the current codebase enricher with Prism's deep index. Hive gains structural understanding, semantic search, and architectural awareness for better task routing, execution context, review, and decomposition.

**Status**: Future work. Build and validate Prism standalone first.

## Design Intent

### Separate Database

Prism runs its own PostgreSQL database (separate from Hive). When integrated, Hive connects to Prism's DB via `@prism/core`'s query modules using a second connection string (`PRISM_DATABASE_URL`). This keeps operational concerns isolated — Prism's schema evolves independently.

### Hive Dependency

```json
// hive/package.json
{
  "dependencies": {
    "@prism/core": "workspace:*"  // or npm version once published
  }
}
```

Hive imports from `@prism/core`:
- `getSymbolsForFile()`, `getDependencies()` — for execution context
- `searchSemantic(projectId, query)` — for task routing
- `getFindings(projectId)` — for review awareness
- `getModuleSummary(projectId, modulePath)` — for decomposition

### Enhanced Codebase Enricher

Replace `src/enrichers/codebase.ts` with a Prism-backed version:

```typescript
// Conceptual — not production code
const prismEnricher: Enricher = {
  name: "prism",
  async run(task, repoDir, priorResults, config) {
    const project = await getOrCreateProject(repoDir);

    // Ensure index is fresh
    await incrementalReindex(project.id);

    // Semantic search for task-relevant code
    const relevant = await searchSemantic(project.id, task.title + " " + task.body);

    // Get architectural context
    const moduleSummaries = await getModuleSummaries(project.id);
    const findings = await getFindings(project.id);

    return {
      data: {
        relevantSymbols: relevant,
        moduleSummaries,
        findings: findings.filter(f => f.severity !== "info"),
        dependencyGraph: await getGraphForFiles(relevant.map(r => r.fileId)),
      },
      costUsd: 0,  // Index already exists, reads are free
      durationMs: elapsed,
    };
  }
};
```

### Git-Aware Incremental Updates

Hive's daemon triggers incremental re-indexing after task execution:

1. Task executes → commits code
2. Post-commit: `incrementalReindex(projectId)` runs
3. Uses `git diff --name-only <lastIndexedCommit>..HEAD`
4. Layer 1 reprocesses changed files (~1 second)
5. Layer 3 regenerates stale summaries (~$0.01)

Trigger points:
- **Post-commit hook** in Hive's execution worker
- **Scheduler** in Hive's daemon (periodic freshness check)
- **On task arrival** for a repo (check staleness, re-index if needed)

### What Hive Gains

| Capability | Before (codebase enricher) | After (Prism index) |
|-----------|---------------------------|---------------------|
| File discovery | Keyword matching on filenames | Semantic search on function descriptions |
| Context for agent | File list + type breakdown | Symbol signatures + summaries + dependency graph |
| Architectural awareness | None | Module summaries, circular deps, coupling metrics |
| Review quality | Code diff only | Diff + dependency impact + pattern violations |
| Task decomposition | LLM guessing | Module boundaries from actual graph |
| Cost per enrichment | ~$0.02 (Claude call) | ~$0 (reads from existing index) |

### Migration Path

1. Build and validate Prism standalone (current blueprint)
2. Publish `@prism/core` as npm package (or use workspace link)
3. Add `@prism/core` to Hive's dependencies
4. Create new `prismEnricher` in `src/enrichers/prism.ts`
5. Run both old codebase enricher and new prism enricher in parallel initially
6. Compare results, validate quality improvement
7. Deprecate old codebase enricher
8. Add daemon trigger for incremental re-indexing post-commit

### Open Questions (Resolve When We Get Here)

- Prism migrations run separately (own DB) — but Hive needs `PRISM_DATABASE_URL` to connect
- How to handle first-time indexing for a new repo (takes minutes) — async? Queue?
- Should Hive's dashboard expose Prism views (findings, graph) or link to Prism's dashboard?
- Auth: Prism always requires Entra ID — when embedded in Hive, share the same Entra app registration or use a separate one?
