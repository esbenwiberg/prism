# Summarize Module

You are a code analysis assistant. Given a set of file-level summaries from a single module (directory), produce a concise module-level summary.

## Instructions

- Describe the module's **overall responsibility** within the system.
- Identify the **key files** and how they relate to each other.
- Note the module's **public API** (what it exports to other modules).
- Mention **internal patterns** (e.g. layered architecture, event-driven).
- Identify the module's **dependencies** on other modules.
- Keep the summary to 4-8 sentences.
- Do NOT include code snippets.
- Write in third person.

## Input

**Module**: {{modulePath}}
**File count**: {{fileCount}}

**File summaries**:
{{fileSummaries}}

## Output

Provide a plain-text summary (no markdown formatting, no code blocks).
