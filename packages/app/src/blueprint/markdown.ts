/**
 * Markdown renderer for hierarchical blueprints.
 *
 * Produces markdown compatible with /flow-milestone consumption:
 *   - renderMasterPlanMarkdown() — overview of all phases
 *   - renderPhaseMarkdown()      — single phase with detailed milestones
 */

import type {
  MasterPlanOutline,
  BlueprintPhase,
  Risk,
} from "./types.js";

// ---------------------------------------------------------------------------
// Master plan markdown
// ---------------------------------------------------------------------------

/**
 * Render the master plan as a markdown overview document.
 */
export function renderMasterPlanMarkdown(plan: MasterPlanOutline): string {
  const lines: string[] = [];

  lines.push(`# ${plan.title}`);
  lines.push(`**Phases: ${plan.phases.length}**`);
  lines.push("");

  // Summary
  lines.push("## Summary");
  lines.push(plan.summary);
  lines.push("");

  // Non-goals
  if (plan.nonGoals.length > 0) {
    lines.push("## Non-Goals");
    for (const ng of plan.nonGoals) {
      lines.push(`- ${ng}`);
    }
    lines.push("");
  }

  // Acceptance criteria
  if (plan.acceptanceCriteria.length > 0) {
    lines.push("## Acceptance Criteria");
    for (const ac of plan.acceptanceCriteria) {
      lines.push(`- ${ac}`);
    }
    lines.push("");
  }

  // Risks
  if (plan.risks.length > 0) {
    lines.push("## Risks");
    for (const r of plan.risks) {
      lines.push(`- **[${r.severity}]** ${r.risk} — *Mitigation: ${r.mitigation}*`);
    }
    lines.push("");
  }

  // Phase overview
  lines.push("## Phase Overview");
  for (let i = 0; i < plan.phases.length; i++) {
    const phase = plan.phases[i];
    lines.push(`${i + 1}. **${phase.title}** — ${phase.milestones.length} milestones`);
  }
  lines.push("");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Phase markdown (flow-milestone compatible)
// ---------------------------------------------------------------------------

/**
 * Render a single phase as markdown, compatible with /flow-milestone.
 *
 * @param phase      — The detailed phase with milestones.
 * @param phaseOrder — 1-based phase number.
 */
export function renderPhaseMarkdown(
  phase: BlueprintPhase,
  phaseOrder: number,
): string {
  const lines: string[] = [];

  lines.push(`# Phase ${phaseOrder}: ${phase.title}`);
  lines.push(`**Milestones: ${phase.milestones.length}**`);
  lines.push("");

  if (phase.intent) {
    lines.push(phase.intent);
    lines.push("");
  }

  for (let i = 0; i < phase.milestones.length; i++) {
    const ms = phase.milestones[i];

    lines.push(`## Milestone ${i + 1}: ${ms.title}`);

    if (ms.intent) {
      lines.push(ms.intent);
      lines.push("");
    }

    if (ms.details) {
      lines.push(ms.details);
      lines.push("");
    }

    if (ms.keyFiles.length > 0) {
      lines.push(`**Key files**: ${ms.keyFiles.join(", ")}`);
      lines.push("");
    }

    if (ms.verification) {
      lines.push("**Verification**:");
      lines.push("```bash");
      lines.push(ms.verification);
      lines.push("```");
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Full blueprint markdown (all phases)
// ---------------------------------------------------------------------------

/**
 * Render a complete hierarchical blueprint as a single markdown document.
 */
export function renderFullBlueprintMarkdown(
  plan: MasterPlanOutline,
  phases: BlueprintPhase[],
): string {
  const parts: string[] = [];

  parts.push(renderMasterPlanMarkdown(plan));
  parts.push("---\n");

  for (let i = 0; i < phases.length; i++) {
    parts.push(renderPhaseMarkdown(phases[i], i + 1));
    if (i < phases.length - 1) {
      parts.push("---\n");
    }
  }

  return parts.join("\n");
}
