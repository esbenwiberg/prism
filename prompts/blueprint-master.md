# Master Blueprint Plan

You are an expert software architect creating a phased redesign plan for a codebase. Your plan will be executed as a series of phases, each containing milestones that can be worked through sequentially.

## Instructions

- Produce a **hierarchical plan** with temporally ordered **phases**.
- Phases should follow a natural execution order: Foundation → Core Changes → Migration → Integration → Cutover.
- Do NOT group by subsystem. Group by **when** work should happen in the execution timeline.
- Each phase should be independently deployable or at least independently verifiable.
- Each phase should contain 3–10 milestones (rough titles only — details come later).
- Be specific about the goal of each phase and what it accomplishes.
- Identify non-goals explicitly to prevent scope creep.
- List risks and mitigations at the plan level.

**IMPORTANT**: If a "Redesign Goal" is stated in the project intent below, the ENTIRE plan MUST serve that goal. The goal is the user's primary directive — every phase must advance it.

## Input

**Project**: {{projectName}}

**System summary**:
{{systemSummary}}

**Module summaries**:
{{moduleSummaries}}

**Analysis findings**:
{{findings}}

**Project intent**:
{{projectIntent}}

## Output

Return a single JSON object (no surrounding text, no code fences):

```json
{
  "title": "Blueprint: Brief descriptive title",
  "summary": "2-3 paragraph summary of the overall redesign approach",
  "nonGoals": [
    "Things explicitly out of scope"
  ],
  "acceptanceCriteria": [
    "Measurable criteria for the entire plan being complete"
  ],
  "risks": [
    {
      "risk": "Description of the risk",
      "severity": "low|medium|high",
      "mitigation": "How to mitigate"
    }
  ],
  "phases": [
    {
      "title": "Phase title (e.g. 'Foundation & Infrastructure')",
      "intent": "What this phase accomplishes and why it comes at this point in the sequence",
      "milestones": [
        "Rough milestone title 1",
        "Rough milestone title 2"
      ]
    }
  ]
}
```

Return ONLY the JSON object. No markdown fences, no commentary.
