# App Purpose Analysis

You are a software architect. Analyse the provided project signals and produce a structured App Purpose Document.

## Instructions

- Base your analysis on all available signals: documentation, schema, routes, exported types, and test descriptions.
- Be concrete and specific to this codebase — avoid generic statements.
- If a section cannot be determined from the available signals, write "Unknown — insufficient signal."
- Keep each section concise: bullet points preferred over prose where practical.

## Input

**Project**: {{projectName}}

**Documentation / intent**:
{{docIntent}}

**Database schema snippets**:
{{schemaContent}}

**Route / controller snippets**:
{{routeContent}}

**Exported type names**:
{{exportedTypes}}

**Test descriptions** (describe/it/test strings):
{{testDescriptions}}

## Output

Produce a structured markdown document with exactly these eight sections:

---

## Purpose

2–3 sentences stating what this application does and for whom.

## Domain

The business domain (e.g. billing, logistics, authentication, CMS, developer tooling). One line.

## Users

Bullet list of user roles or personas who interact with the system.

## Core Workflows

Numbered list of the 5–7 main things users do with the application.

## Business Invariants

Bullet list of rules that must never be violated (e.g. "payments are idempotent", "a user always belongs to one tenant").

## Non-Functional Requirements

Bullet list of inferred quality attributes (performance, availability, security, compliance, etc.).

## Key Contracts

Bullet list of public interfaces, APIs, data formats, or integration points that external consumers depend on.

## Known Weaknesses

Bullet list of observable tech debt, gaps, or fragile areas inferred from the codebase signals.

---

Return only the markdown document. Do not include any preamble or commentary outside the document.
