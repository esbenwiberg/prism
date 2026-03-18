# Plan: Build Trust in the Prism Index

> Goal: Move from "probably works" to "we can prove it works" — both for indexing quality and context enrichment accuracy.

---

## 1. Golden Repo Integration Test Suite

**Problem**: No end-to-end test that indexes a known codebase and asserts "the output makes sense." Individual unit tests validate components but can't catch systemic quality issues.

### 1.1 Create the Golden Repo

Create a small, purpose-built repo at `test/fixtures/golden-repo/` with known characteristics:

```
golden-repo/
├── src/
│   ├── auth/
│   │   ├── auth-service.ts      # High coupling (imports 4+ files)
│   │   ├── token-validator.ts   # Pure function, no deps
│   │   └── session-store.ts     # Depends on db/
│   ├── db/
│   │   ├── connection.ts        # Core infra, many reverse deps
│   │   ├── user-repository.ts   # Depends on connection + models
│   │   └── models.ts            # Types only, no logic
│   ├── api/
│   │   ├── routes.ts            # Imports auth + db (layering violation if we define layers)
│   │   ├── middleware.ts         # Circular dep with auth-service
│   │   └── handlers.ts          # God module: 15+ functions, high complexity
│   ├── utils/
│   │   ├── logger.ts            # Widely imported
│   │   ├── dead-code.ts         # Exported but never imported anywhere
│   │   └── helpers.ts           # Mix of used and unused exports
│   └── index.ts                 # Entry point
├── README.md                    # Known project intent
├── package.json
└── tsconfig.json
```

**Design principles for the golden repo:**

- **Known dependency graph** — every edge is intentional and documented
- **Known anti-patterns** — circular dep (middleware ↔ auth-service), god module (handlers.ts), dead code (dead-code.ts), high coupling (auth-service.ts)
- **Known blast radius** — changing `connection.ts` should ripple to user-repository, session-store, and transitively to auth-service, routes
- **Known metrics** — document expected cyclomatic complexity, coupling, cohesion per file
- **Deterministic** — no randomness, no external deps, no generated code

### 1.2 Structural Layer Assertions

Test that after indexing the golden repo, the structural layer produces correct:

- [ ] **Symbol extraction** — exact count and names of functions/classes/interfaces per file
- [ ] **Dependency graph** — exact edges (source → target, kind) match expected graph
- [ ] **Cyclomatic complexity** — per-function complexity matches hand-calculated values
- [ ] **Coupling metrics** — efferent/afferent coupling per file matches expected counts
- [ ] **Cohesion** — validates files with all-internal refs score higher than files with all-external deps
- [ ] **File detection** — all files found, correct languages, correct sizes, skip patterns respected

### 1.3 Analysis Layer Assertions

Test that pattern detectors find the planted anti-patterns:

- [ ] **Circular dependency** — detects middleware ↔ auth-service cycle
- [ ] **Dead code** — flags `dead-code.ts` exports as unused
- [ ] **God module** — flags `handlers.ts` (exceeds complexity/symbol-count thresholds)
- [ ] **Coupling issues** — flags `auth-service.ts` as high efferent coupling
- [ ] **No false positives** — `token-validator.ts` (clean, pure function) should have zero findings

### 1.4 Blast Radius Assertions

- [ ] **Single file** — `connection.ts` blast radius includes user-repository, session-store (depth 1) and auth-service, routes (depth 2)
- [ ] **Aggregated** — changing [auth-service.ts, connection.ts] together surfaces middleware, routes, session-store ranked by overlap

### 1.5 Semantic Layer Smoke Tests

Since LLM output isn't deterministic, these are softer assertions:

- [ ] **Coverage** — every summarizable symbol gets a summary (no silent drops)
- [ ] **Input hash stability** — re-indexing without code changes produces zero new LLM calls
- [ ] **Embedding existence** — every summary has a corresponding embedding row
- [ ] **Search relevance** — querying "authentication" returns auth/ files in top 5; querying "database connection" returns db/ files in top 5

---

## 2. Summary Quality Scoring

**Problem**: LLM summaries are stored as-is with no quality gate. A vague or hallucinated summary gets embedded and served just like a good one.

### 2.1 Self-Assessment Score

After generating each summary, ask the LLM to rate its own confidence:

- Add a `qualityScore` field (0-1) to the `prism_summaries` table
- Append to the summarization prompt: "Rate your confidence that this summary accurately captures the function's purpose (0.0-1.0)"
- Parse the score from the response
- **Monitoring**: track average quality score per indexing run in `prism_index_runs`

### 2.2 Low-Quality Summary Strategy: Retry then Demote (not discard)

Discarding a summary leaves a black hole in the index — no summary means no embedding, which means the symbol is invisible to semantic search. That's worse than a mediocre summary. Instead, use a tiered approach:

1. **First attempt**: standard summarization prompt
2. **If `qualityScore < 0.4`**: retry once with an **enhanced prompt** — inject additional context:
   - The file-level summary (if available)
   - Signatures of neighboring symbols in the same file
   - The function's callers/callees from the dependency graph
3. **If retry still scores < 0.4**: keep the summary but **demote** it:
   - Store with a `demoted` flag
   - Still embed it (so the symbol isn't invisible to search)
   - Apply a relevance penalty during search ranking (e.g., multiply similarity score by 0.5)
   - Surface demoted summaries in the quality dashboard for human review

**Why not discard?** A shitty summary that says "validates authentication tokens" is still better than nothing when someone searches "auth token validation". The penalty ensures it ranks below good summaries but still shows up as a last resort.

**Why not retry indefinitely?** LLMs are mostly deterministic at low temperature. If the same code produces a bad summary twice (with different prompts), a third attempt won't magically fix it. The code is likely genuinely hard to summarize (generated code, deeply nested logic, etc.).

### 2.3 Heuristic Quality Checks

Complement LLM self-assessment with deterministic checks:

- **Too short** — summary < 20 chars for a function with 50+ lines of code → flag
- **Too generic** — summary matches a known list of vague phrases ("This function does things", "Handles logic") → flag
- **Missing key terms** — if the function name contains "auth", "cache", "validate", the summary should contain at least one of those terms → flag if missing

### 2.4 Quality Dashboard

Surface quality metrics in the HTMX dashboard:

- Distribution of quality scores per layer/module
- List of flagged low-quality summaries for human review
- Trend over time (does quality improve with prompt tuning?)

---

## 3. Explicit File Mention Resolution in Context Enrichment

**Problem**: When a task mentions specific filenames (e.g., "update `src/auth/service.ts` and `src/db/connection.ts`"), the system relies on keyword matching to _maybe_ find them. Mentioned files should be **guaranteed** in the response.

### 3.1 File Path Extraction from Query

Add a new signal collector: `collectExplicitMentionSignal()`

- **Regex extraction** — scan query for patterns that look like file paths:
  - Backtick-wrapped paths: `` `src/auth/service.ts` ``
  - Slash-containing tokens: `src/auth/service.ts`
  - Extension-bearing tokens: `service.ts`, `connection.py`
- **Fuzzy resolution** — for each extracted path:
  - Exact match against project file paths
  - Suffix match (e.g., `service.ts` matches `src/auth/service.ts`)
  - If multiple matches, rank by path specificity (longer match = better)
- **Priority 1** — explicitly mentioned files get highest priority in context assembly, above semantic search results

### 3.2 Auto-Include Mentioned Files in Blast Radius

When files are explicitly mentioned:

1. Resolve them to file IDs
2. Run `collectAggregatedBlastRadius()` with those IDs as sources (not just semantic top-5)
3. Merge with any semantic-derived blast radius, deduplicating
4. This ensures the user sees "if you touch these files, here's what else gets affected"

### 3.3 Forward Dependency Context for Mentioned Files

Current gap: blast radius only shows reverse deps (who depends on me). For mentioned files, also include:

- **Forward deps** (what do I depend on?) — important for understanding what a file needs
- **Depth 1 only** to keep it focused
- Present as a separate section: "Dependencies of mentioned files"

### 3.4 Dependency Graph Enrichment

For explicitly mentioned files, walk the dependency graph in both directions and enrich:

- **Reverse deps (blast radius)** — "Changing this file may affect: ..."
- **Forward deps** — "This file depends on: ..."
- **Shared dependencies** — if multiple files are mentioned, highlight shared deps (potential integration points)
- **Symbol-level deps** — where possible, show which specific exports are consumed (not just file-level edges)

---

## 4. Documentation Surfacing in Context Enrichment

**Problem**: Docs are parsed and stored (`prism_files.doc_content`) but **never read back** during context enrichment. The `doc_content` column is write-only. A migration guide, architecture decision record, or onboarding doc exists in the database but is completely invisible to task context queries. The `ProjectIntent` object (assembled from all docs/configs/comments) is logged then thrown away — never persisted.

This is the single biggest trust gap: the system indexes documentation but never uses it.

### 4.1 Embed Documentation Files

The semantic layer currently only processes code symbols (functions, classes, interfaces). Extend it to also embed doc files:

- Query `prism_files` where `isDoc = true` and `doc_content IS NOT NULL`
- For each doc file, chunk the `doc_content` by heading sections (already parsed in the docs layer)
- Summarize each chunk with Haiku (same as code symbols), using a doc-specific prompt:
  - "Summarize this documentation section. What topic does it cover? What guidance does it provide?"
- Store summaries in `prism_summaries` with a new level: `"doc"` (targetId: `doc:<filePath>:<sectionHeading>`)
- Embed each summary into `prism_embeddings` — now docs are searchable via vector similarity

**Chunking strategy for docs:**
- Split by H2 headings (each section becomes a chunk)
- If a section exceeds 3000 tokens, split further at H3 level
- Preserve heading hierarchy in the chunk for context (e.g., "## Migration > ### Controller Migration")
- Include the document title/path as metadata so results are traceable

**What this unlocks**: Query "how do I migrate controllers?" → vector search finds the migration guide section about controllers → surfaces in context as a Priority 2 signal.

### 4.2 Doc-Aware Semantic Signal

Extend `collectSemanticSignal()` to include doc results:

- Vector search already returns results from `prism_embeddings` — once docs are embedded, they'll naturally appear
- Add a **doc boost**: if a result is from a doc embedding (level = "doc"), apply a small relevance boost (+0.1) when the query contains question words ("how", "why", "what", "guide", "migrate", "setup")
- Present doc results in a separate context section: **"Relevant Documentation"** (Priority 2) — distinct from "Relevant Code" so the consumer knows the source type

### 4.3 Persist the Project Intent

The `ProjectIntent` object is assembled from all docs/configs/comments but only logged. Fix this:

- Store it as a `prism_summaries` row with level `"intent"`, targetId `"intent:<projectName>"`
- Include input hash (hash of all doc_content that fed into it) for incremental detection
- On reindex: only regenerate if any doc file's `doc_content` changed
- Surface in `assembleArchitectureOverview()` and `assembleTaskContext()` as Priority 1 alongside the purpose/system summaries

### 4.4 Full-Text Doc Search (Keyword Fallback)

Vector search is great for semantic similarity, but sometimes you just need exact keyword matching against doc content. Add a fallback:

- When semantic signal returns < 3 doc results, run a **full-text search** on `prism_files.doc_content` where `isDoc = true`
- Use PostgreSQL `to_tsvector` / `ts_query` for efficient full-text search (or simple `ILIKE` for MVP)
- Add a GIN index on `doc_content` for `isDoc = true` files
- Results are Priority 3 (below vector matches, above blast radius)

This catches cases where the doc uses different terminology than the query but contains the exact keyword the user typed.

### 4.5 Doc Relevance in Task Context

Wire docs into `assembleTaskContext()` specifically:

1. After semantic search, partition results into code vs doc signals
2. For doc signals, include the full `doc_content` section (not just the summary) — docs are meant to be read, not abbreviated
3. Token budget allocation: reserve up to 20% of context budget for docs (configurable)
4. If multiple doc sections match, rank by:
   - Vector similarity score (primary)
   - Recency of doc file change (secondary — recently updated docs are more relevant)
   - Doc type: ADRs and guides rank above changelogs

### 4.6 Golden Repo Doc Assertions

Extend the golden repo (section 1) with documentation files to test this:

```
golden-repo/
├── docs/
│   ├── migration-guide.md       # "How to migrate controllers from v1 to v2"
│   ├── architecture-decisions/
│   │   └── adr-001-auth-flow.md # "Why we chose JWT over session-based auth"
│   └── onboarding.md            # "Getting started with the codebase"
├── README.md                    # Project overview
└── ...existing code files...
```

Test assertions:
- [ ] **Doc embedding coverage** — all doc files have embeddings
- [ ] **Search relevance** — query "migrate controllers" returns migration-guide.md in top 3
- [ ] **Search relevance** — query "why JWT" returns adr-001-auth-flow.md in top 3
- [ ] **Intent persistence** — `ProjectIntent` exists as a summary row after indexing
- [ ] **Task context includes docs** — `assembleTaskContext("migrate the auth controller")` includes the migration guide AND the auth ADR in response sections

---

## 5. Embedding Quality & Deduplication

**Problem**: Every summary gets embedded regardless of quality. Near-duplicate embeddings waste space and dilute search results.

### 4.1 Pre-Embedding Quality Gate

- Only embed summaries with `qualityScore >= 0.4` (from section 2.1)
- Skip embedding for summaries flagged by heuristic checks
- Log skipped embeddings for monitoring

### 4.2 Near-Duplicate Detection

After embedding, check for near-duplicates:

- Cosine similarity > 0.95 between two embeddings in the same project → flag as potential duplicate
- Surface duplicates in quality dashboard
- Don't auto-merge (different files can legitimately have similar summaries), but use as a quality signal

---

## 5. Cross-File Staleness Propagation

**Problem**: If file B's summary changes after reindexing, file A (which imports B) doesn't get flagged for re-summarization. The semantic understanding of A may now be stale.

### 5.1 Dependency-Aware Dirty Flags

During incremental reindex:

1. After structural layer identifies changed files
2. Walk the reverse dependency graph (depth 1) from changed files
3. Mark direct dependents as "semantically stale" (not structurally changed, but context changed)
4. In semantic layer: re-summarize stale files even if their own content hash hasn't changed
5. **Guard against cascade explosion**: limit stale propagation to depth 1, cap at 50 files

### 5.2 Staleness Metadata

- Add `staleReason` field to tracking: "content_changed" vs "dependency_changed"
- Track in `prism_index_runs` how many files were reindexed due to staleness propagation
- This helps tune the depth/cap if it gets too expensive

---

## 6. Finding Deduplication & Confidence

**Problem**: The same architectural issue can be flagged by multiple detectors (coupling detector + god-module detector), creating noise.

### 6.1 Finding Fingerprinting

- Generate a fingerprint per finding: hash of (category + primary file + severity)
- After all detectors run, group findings by overlapping file scope
- Merge findings that share the same primary file and related category (e.g., coupling + god-module on the same file → single finding with multiple evidence sources)

### 6.2 Confidence Scoring

- Each detector assigns a raw score based on how far the metric exceeds its threshold
- Normalize to 0-1 confidence: `confidence = min(1, (metric - threshold) / threshold)`
- Merged findings take the max confidence across contributing detectors
- Surface confidence in findings output and dashboard

---

## 7. Analysis Layer Cost Optimization

**Problem**: Analysis is the most expensive layer — it uses Sonnet for every file/module/system rollup call, plus gap analysis. The dirty-flag propagation already skips clean files, but on large changes the cost adds up fast.

### Current cost structure

The analysis layer makes LLM calls at three levels, all using Sonnet:

| Call type | Input | Count | Relative cost |
|-----------|-------|-------|--------------|
| File rollup | Function summaries → file summary | 1 per dirty file | High (most calls) |
| Module rollup | File summaries → module summary | 1 per dirty module | Medium |
| System rollup | Module summaries → system summary | 0 or 1 | Low |
| Gap analysis | Intent doc + system summary → gaps | 0 or 1 | Low (but expensive per call) |

File rollup is the volume driver. If you change 50 files, that's 50 Sonnet calls just for file summaries.

### 7.1 Tiered Model Selection

Not every rollup needs Sonnet. File-level rollup is simple aggregation — "summarize these function summaries into a file summary." Module and system rollup require more reasoning across broader context.

- **File rollup → Haiku** — simple aggregation task, Haiku handles it well at ~10x lower cost
- **Module rollup → Haiku or Sonnet** (configurable, default Haiku) — moderate reasoning
- **System rollup → Sonnet** — needs to synthesize the whole codebase, keep the big gun
- **Gap analysis → Sonnet** — comparative reasoning, keep Sonnet

Add `analysis.fileRollupModel` and `analysis.moduleRollupModel` config fields, defaulting to Haiku. This alone could cut analysis cost by 60-80% on typical runs.

**Trade-off**: Haiku file summaries may be slightly less nuanced. Mitigate by using the quality scoring from section 2 — if Haiku produces low-quality file summaries, the retry with enhanced prompt kicks in (still cheaper than Sonnet-first).

### 7.2 Summary Delta Detection — Skip Trivial Changes

Even dirty files don't always need re-rolling. If a file has 20 functions and one had a whitespace-only summary change, the file summary won't meaningfully differ.

- After semantic layer, compute a **summary delta score** per file: what percentage of its function summaries actually changed content (not just input hash)?
- If delta < 10% (e.g., 1 of 15 function summaries changed, and the content diff is minor), **skip file rollup** and reuse the existing file summary
- Track skipped files as `skip_reason: "trivial_delta"` for monitoring

How to compute delta cheaply:
1. Compare old vs new function summary content hashes per file
2. Count changed / total ratio
3. For changed summaries, compute edit distance between old and new content — if < 15% character change, treat as trivial

### 7.3 Batch File Rollups

Currently each file gets its own Sonnet call. For small files (< 5 function summaries), batch multiple files into a single LLM call:

- Group dirty files by module (they share context)
- If a module has N dirty files each with < 5 function summaries, batch them into one prompt: "Summarize each of these files separately:"
- Parse the response back into individual file summaries
- **Cap batch size** at 10 files or 4000 input tokens (whichever is smaller)

This reduces call count without changing output quality — the LLM sees the same information, just in one shot.

### 7.4 Gap Analysis Caching

Gap analysis only runs when the system summary changes, which is already good. But it also re-parses all docs/config/comments from scratch every time. Cache the intent document:

- Store the intent document hash alongside the gap analysis findings
- On next run, if system summary changed but intent doc hash is the same, only re-run gap analysis with the new system summary (skip intent assembly)
- If both changed, full re-run

### 7.5 Cost Tracking & Alerts

Make the cost visible so it's easy to spot regressions:

- Log per-layer cost breakdown at the end of each index run (already partially done)
- Add a `costBreakdown` field to `prism_index_runs`: `{ fileRollup: X, moduleRollup: Y, systemRollup: Z, gapAnalysis: W }`
- Surface in dashboard: cost per run, cost trend, cost per file (helps identify if a specific module is disproportionately expensive)
- Optional: configurable alert threshold — warn if analysis cost exceeds 2x the previous run

---

## Implementation Order

| Phase | Work | Depends On | Why This Order |
|-------|------|------------|----------------|
| **1** | Golden repo + structural assertions (1.1-1.2) | Nothing | Foundation — validates the base layer everything else builds on |
| **2** | Analysis assertions + blast radius assertions (1.3-1.4) | Phase 1 | Uses golden repo, validates detection accuracy |
| **3** | Explicit file mention resolution (3.1-3.2) | Nothing | High user-facing impact, independent of quality scoring |
| **4** | Forward deps + graph enrichment for mentions (3.3-3.4) | Phase 3 | Extends the mention resolution with dep graph context |
| **5** | Doc embedding + doc-aware semantic signal (4.1-4.2) | Nothing | Unlocks the entire doc surfacing pipeline |
| **6** | Persist project intent + full-text fallback (4.3-4.4) | Phase 5 | Builds on doc embeddings, adds keyword fallback |
| **7** | Doc relevance in task context + golden repo doc tests (4.5-4.6) | Phase 6 | Wires docs into context, validates with assertions |
| **8** | Summary quality scoring + retry/demote strategy (2.1-2.3) | Nothing | Needed before embedding quality gate |
| **9** | Embedding quality gate + dedup (5.1-5.2) | Phase 8 | Uses quality scores to filter |
| **10** | Tiered model selection for analysis (8.1) | Nothing | Biggest cost win, zero quality risk for system/gap |
| **11** | Summary delta detection + batch rollups (8.2-8.3) | Phase 10 | Builds on tiered models, further reduces call count |
| **12** | Cross-file staleness propagation (6.1-6.2) | Phase 1 | Needs golden repo to test correctness |
| **13** | Finding dedup + confidence (7.1-7.2) | Phase 2 | Needs analysis assertions to validate |
| **14** | Gap analysis caching + cost tracking (8.4-8.5) | Phase 11 | Polish — cache intent doc, surface cost breakdown |
| **15** | Semantic smoke tests (1.5) + quality dashboard (2.4) | Phase 8, 9 | Capstone — validates the full pipeline end-to-end |

Phases 1, 3, 5, 8, and 10 can run in parallel — no dependencies between them.

---

## Success Criteria

After all phases:

1. **Golden repo tests pass in CI** — regressions are caught automatically (incl. doc assertions)
2. **Explicitly mentioned files always appear in context** — no more "hope the keyword matcher finds it"
3. **Blast radius includes mentioned files' deps** — users see the full impact picture
4. **Docs surface in task context** — query "migrate controllers" finds the migration guide, not just code files
5. **Project intent persisted and queryable** — not logged and discarded
6. **Summary quality is measurable** — average score tracked, low-quality summaries demoted (not lost)
7. **No duplicate findings** — same issue reported once with highest confidence
8. **Staleness propagation works** — changing a dependency triggers downstream re-summarization
9. **Analysis layer cost reduced 50-80%** — tiered models + delta detection + batching, without losing system/module quality
10. **Cost is visible** — per-layer breakdown in dashboard, alert on cost spikes
