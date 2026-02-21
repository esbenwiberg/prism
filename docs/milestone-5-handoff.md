# Milestone 5 — Layer 2: Documentation Parsing

## Summary

Implemented the documentation parsing layer (Layer 2) of the indexing pipeline. This layer runs after the structural layer and processes README/docs files, config files, and inline comments to build the "intent layer" -- a structured understanding of what the codebase is supposed to do.

## Files Created

### Core Modules (packages/core/src/indexer/docs/)

- **readme.ts** -- README and documentation file parsing. Extracts headers, sections, purpose, architecture descriptions, and setup instructions from markdown files. Identifies doc files via path patterns (README.md, docs/, CHANGELOG, LICENSE, etc.).

- **comments.ts** -- Inline comment and docstring extraction. Handles JS/TS (JSDoc, //, block comments), Python (docstrings, # comments), and C# (XML doc comments, //, block comments). Identifies file-level header comments.

- **config.ts** -- Config file detection and purpose identification. Recognizes 60+ config file patterns across categories: package managers, TypeScript, linters, formatters, bundlers, test frameworks, CI/CD, Docker, environment, Git, database, and deployment. Extracts details from package.json (name, description, deps, scripts), tsconfig.json (target, module, strict), Dockerfiles (base image), and .env files (variable names). Builds tech stack info.

- **intent.ts** -- Intent layer assembly. Combines README info, config purpose, inline comments, and tech stack into a coherent ProjectIntent structure with description, purpose, architecture, tech stack summary, and module breakdown.

### Tests (packages/core/src/indexer/docs/)

- **readme.test.ts** -- 23 tests covering isDocumentationFile, parseMarkdownSections, parseReadme, parseDocFiles
- **comments.test.ts** -- 17 tests covering JS/TS, Python, C# comment extraction, file header detection
- **config.test.ts** -- 21 tests covering isConfigurationFile, classifyConfigFile, parseConfigFiles, buildTechStack, buildConfigDocContent
- **intent.test.ts** -- 11 tests covering assembleIntent, buildIntentDocContent

### Modified Files

- **packages/core/src/db/queries/files.ts** -- Added `updateFileDocContent()` function to update the doc_content column
- **packages/core/src/db/queries/index.ts** -- Added export for `updateFileDocContent`
- **packages/core/src/indexer/pipeline.ts** -- Replaced docs layer placeholder with `executeDocsLayer()` that orchestrates all docs sub-modules
- **packages/core/src/indexer/index.ts** -- Added barrel exports for all docs sub-modules and types

## Pipeline Integration

The docs layer (`executeDocsLayer`) in pipeline.ts:
1. Walks project files (reuses structural layer's walker)
2. Parses documentation files (README, CHANGELOG, etc.) and updates doc_content
3. Parses config files and updates doc_content
4. Extracts inline comments from source files and updates doc_content for files with meaningful comments
5. Builds tech stack info from configs and file extensions
6. Assembles the project intent combining all sources
7. Tracks progress via index_runs table

## Test Results

- **116 tests passing** (44 existing + 72 new)
- Build passes cleanly (`npm run build`)
- No new dependencies added

## Types Exported

- `DocSection`, `ReadmeParseResult` (readme.ts)
- `CommentKind`, `ExtractedComment`, `FileCommentsResult` (comments.ts)
- `ConfigCategory`, `ConfigInfo`, `TechStackInfo` (config.ts)
- `ProjectIntent`, `TechStackSummary`, `ModuleIntent` (intent.ts)

## Key Design Decisions

1. **No tree-sitter dependency for docs layer** -- Comment extraction uses regex-based parsing on raw content rather than requiring tree-sitter ASTs. This is simpler and works for files without tree-sitter grammar support.

2. **Config pattern matching** -- Uses 60+ regex patterns organized by category rather than a simpler extension-based approach. This provides accurate classification and purpose descriptions.

3. **Intent assembly is pure computation** -- No LLM calls needed. The intent is assembled from structured data extracted in earlier steps. LLM-powered analysis happens in later layers (semantic, analysis, blueprint).

4. **doc_content updates are per-file** -- Each file gets its own doc_content string stored in the database. The project-level intent is logged but not stored as a synthetic file record.

## Next Milestone

Milestone 6 should build on the structural (Layer 1) and documentation (Layer 2) data to implement the semantic layer (Layer 3) with LLM-powered summarization and embeddings.
