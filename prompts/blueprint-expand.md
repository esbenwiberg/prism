# Expand Milestone Descriptions: {{phaseTitle}}

You are filling in missing implementation details for milestones in a software redesign phase. The milestones already have titles — your job is to add concrete step-by-step implementation guides.

## Phase Context

**Phase**: {{phaseTitle}}
**Phase intent**: {{phaseIntent}}

## Milestones to Expand

{{milestones}}

## Instructions

For each milestone listed above, produce:

- **intent**: One sentence describing what this milestone accomplishes and why it belongs in this phase.
- **keyFiles**: Specific files to create or modify (project-relative paths). List only files that will actually change.
- **verification**: A concrete command to confirm the milestone is complete (`npm run build && npm test -- path/` etc).
- **details**: A numbered step-by-step implementation guide. Each step must name the specific file, function, or construct being changed. **Minimum 3 concrete numbered steps.** No vague language like "implement the feature" or "add error handling". Every step must reference specific code.

## Output

Return a JSON array only — no code fences, no surrounding text:

[
  {
    "milestoneOrder": 1,
    "intent": "What this milestone accomplishes",
    "keyFiles": ["src/path/to/file.ts", "src/other/file.ts"],
    "verification": "npm run build && npm test",
    "details": "1. Open `src/db/schema.ts` and add column `foo` to the `prism_bars` table.\n2. Run `npm run db:generate` to create a migration file.\n3. Update function `getBar` in `src/db/queries/bars.ts` to select and return the new field."
  }
]
