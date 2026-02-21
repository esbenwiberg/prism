# Milestone 7 Handoff — Blueprint Export

## What Was Done

Added blueprint export functionality to the Prism dashboard, allowing users to download blueprints as Markdown or JSON files directly from the web interface.

## Changes

### New File: `packages/app/src/dashboard/routes/export.ts`
- **GET `/projects/:id/blueprints/export?format=md`** — Downloads all blueprints for a project as a single concatenated Markdown file
- **GET `/projects/:id/blueprints/:bid/export?format=md`** — Downloads a single blueprint as Markdown
- **GET `/projects/:id/blueprints/:bid/export?format=json`** — Downloads a single blueprint as JSON
- Sets `Content-Disposition: attachment` headers for proper file download behavior
- Returns 404 when no blueprints are found or when a specific blueprint does not exist
- Validates format query parameter (only `md` for bulk, `md` or `json` for single)
- Reuses existing `renderFullBlueprintMarkdown()` from `packages/app/src/blueprint/markdown.ts`
- JSON export includes full hierarchy: plan metadata, phases, milestones with all fields

### Modified: `packages/app/src/dashboard/server.ts`
- Imported and registered `exportRouter`
- Registered **before** `blueprintsRouter` to avoid route parameter collision (`/projects/:id/blueprints/export` would otherwise match as `:planId`)

### Modified: `packages/app/src/dashboard/views/blueprints.ts`
- Added "Download All (Markdown)" button at the top of the blueprints list page (visible when plans exist)
- Replaced the single "Export Markdown" link on the blueprint detail page with a dropdown menu offering both Markdown and JSON download options

## Routes Summary

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/projects/:id/blueprints/export?format=md` | Download all blueprints as markdown |
| GET | `/projects/:id/blueprints/:bid/export?format=md` | Download single blueprint as markdown |
| GET | `/projects/:id/blueprints/:bid/export?format=json` | Download single blueprint as JSON |

## Architecture Notes

- The export routes use a shared `assembleBlueprint()` helper that fetches a plan with all its phases and milestones from the hierarchical blueprint tables (`prism_blueprint_plans` / `prism_blueprint_phases` / `prism_blueprint_milestones`)
- JSON export uses `buildJsonExport()` which produces a clean, self-contained JSON structure with phase and milestone ordering
- The existing per-phase export routes in `blueprintsRouter` (`/blueprints/phases/:phaseId/export` and `/blueprints/plans/:planId/export`) remain intact for backward compatibility

## Verification

```bash
npm run build   # Passes — no type errors
npm test        # 26 test files, 313 tests all passing
```

## Known Considerations

- Route ordering in `server.ts` is critical: `exportRouter` must be registered before `blueprintsRouter` because `/projects/:id/blueprints/export` would match the `:planId` parameter pattern in the blueprints router
- The dropdown menu on the detail page uses inline JavaScript (`onclick`) consistent with the existing HTMX-first dashboard approach
