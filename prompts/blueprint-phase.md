# Phase Detail: {{phaseTitle}}

You are an expert software architect detailing the milestones for a single phase of a larger redesign plan. Each milestone must be small enough to implement in a focused coding session and must include concrete verification steps.

## Context

**Project**: {{projectName}}

**Master plan summary**:
{{masterPlanSummary}}

**Previous phases** (already completed or planned before this one):
{{previousPhases}}

**Next phases** (planned after this one):
{{nextPhases}}

## This Phase

**Phase {{phaseOrder}} of {{totalPhases}}**: {{phaseTitle}}

**Phase intent**: {{phaseIntent}}

**Rough milestone titles from master plan**:
{{milestoneTitles}}

**Relevant findings for this phase**:
{{relevantFindings}}

**System summary**:
{{systemSummary}}

## Instructions

- Expand each rough milestone title into a fully detailed milestone.
- You may split or merge rough milestones if it improves the execution flow, but stay close to the original outline.
- Each milestone should take 1-4 hours of focused work.
- **key_files**: List the specific files that will be created or modified (use project-relative paths).
- **verification**: Provide concrete commands to verify the milestone is complete (build, test, lint commands).
- **details**: Write a **numbered step-by-step implementation guide**. Each step must be concrete and actionable (e.g. "1. Add `X` field to `src/db/schema.ts`. 2. Modify function `Y` in `src/api/routes.ts` to…"). **Any milestone whose `details` contains fewer than 3 concrete numbered steps is invalid.**
- **decisions**: List the explicit architectural choices made for this milestone. Each entry must name the choice, the alternatives considered, and the reason for the selection. Do not leave this array empty if there are meaningful design choices to document.
- Milestones must be ordered so each builds on the previous one.
- The first milestone in a phase should be achievable without depending on unfinished work from this phase.
- **Banned phrases**: Do not write vague one-liners like "implement the feature", "add error handling", or "update the code". Every step must name the specific file, function, or construct being changed.

## Output

Return ONLY a single raw JSON object. No markdown fences, no surrounding text, no commentary.

The JSON must have this shape:

{
  "title": "Phase title",
  "intent": "Phase intent/purpose",
  "milestones": [
    {
      "title": "Specific milestone title",
      "intent": "What this milestone accomplishes",
      "keyFiles": ["src/path/to/file.ts", "src/other/file.ts"],
      "verification": "npm run build && npm test -- src/path/",
      "details": "1. Open `src/db/schema.ts` and add column `foo` to the `bar` table.\n2. Run `npm run db:generate` to create a migration.\n3. Update `src/api/routes.ts` function `handleBar` to read the new field and return it in the response.",
      "decisions": [
        "Used jsonb over a separate table for storing X because the data is always read with the parent record and does not need to be queried independently. Alternative: separate normalized table — rejected due to join overhead.",
        "Chose optimistic locking over pessimistic locking for Y because concurrent edits are rare. Alternative: row-level locks — rejected as they would serialize requests unnecessarily."
      ]
    }
  ]
}
