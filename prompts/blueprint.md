# Redesign Blueprint

You are an expert software architect. Given a comprehensive understanding of a codebase (system summary, module summaries, analysis findings, and project intent), produce actionable redesign proposals.

## Instructions

- Focus on **high-impact improvements** that address the identified findings.
- Each proposal should target a specific **subsystem or concern**.
- Include a clear **proposed architecture** describing the target state.
- List specific **module changes** needed (add, modify, remove, move).
- Provide a practical **migration path** with ordered steps.
- Identify **risks** and mitigation strategies.
- Explain the **rationale** connecting findings to the proposed changes.
- Be specific and actionable, not vague.

## Input

**Project**: {{projectName}}

**System summary**:
{{systemSummary}}

**Analysis findings**:
{{findings}}

**Project intent** (from documentation):
{{projectIntent}}

## Output

Return a JSON array of blueprint proposals. Each proposal should have:
```json
[
  {
    "title": "Brief title of the redesign proposal",
    "subsystem": "Target subsystem or module",
    "summary": "1-2 sentence summary of the proposal",
    "proposedArchitecture": "Detailed description of the target architecture",
    "moduleChanges": [
      {
        "module": "path/to/module",
        "action": "add|modify|remove|move",
        "description": "What to change and why"
      }
    ],
    "migrationPath": "Step-by-step migration plan",
    "risks": [
      {
        "risk": "Description of the risk",
        "severity": "low|medium|high",
        "mitigation": "How to mitigate"
      }
    ],
    "rationale": "Why this change addresses the identified issues"
  }
]
```

Return ONLY the JSON array, no surrounding text.
