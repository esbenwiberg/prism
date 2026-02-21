# Phase Detail: {{phaseTitle}}

You are an expert software architect detailing the milestones for a single phase of a larger redesign plan. Each milestone must be small enough to implement in a focused coding session and must include verification steps.

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
- **details**: Write a thorough description of what to implement, including architectural decisions and edge cases.
- Milestones must be ordered so each builds on the previous one.
- The first milestone in a phase should be achievable without depending on unfinished work from this phase.

## Output

Return a single JSON object (no surrounding text, no code fences):

```json
{
  "title": "Phase title",
  "intent": "Phase intent/purpose",
  "milestones": [
    {
      "title": "Specific milestone title",
      "intent": "What this milestone accomplishes",
      "keyFiles": ["src/path/to/file.ts", "src/other/file.ts"],
      "verification": "npm run build && npm test -- src/path/",
      "details": "Detailed description of the implementation..."
    }
  ]
}
```

Return ONLY the JSON object. No markdown fences, no commentary.
