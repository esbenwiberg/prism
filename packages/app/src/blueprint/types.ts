/**
 * Blueprint domain types for Layer 5 — hierarchical redesign blueprints.
 *
 * The blueprint layer produces a Phase → Milestone hierarchy:
 *   MasterPlanOutline (pass 1) → PhaseOutline[] → PhaseMilestone[] (pass 2)
 *
 * Stored in DB as: prism_blueprint_plans → prism_blueprint_phases → prism_blueprint_milestones
 */

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------

/** A risk associated with a blueprint plan. */
export interface Risk {
  /** Description of the risk. */
  risk: string;
  /** Severity of the risk. */
  severity: "low" | "medium" | "high";
  /** How to mitigate the risk. */
  mitigation: string;
}

// ---------------------------------------------------------------------------
// Phase outline (from pass 1 — master plan)
// ---------------------------------------------------------------------------

/** A phase outline produced by the master plan LLM pass. */
export interface PhaseOutline {
  /** Title of the phase (e.g. "Foundation & Infrastructure"). */
  title: string;
  /** Why this phase exists and what it accomplishes. */
  intent: string;
  /** Rough milestone titles within this phase. */
  milestones: string[];
}

// ---------------------------------------------------------------------------
// Master plan outline (pass 1 output)
// ---------------------------------------------------------------------------

/** The master plan produced by the first LLM pass. */
export interface MasterPlanOutline {
  /** Title of the overall blueprint. */
  title: string;
  /** High-level summary of the redesign. */
  summary: string;
  /** Explicit non-goals to set scope boundaries. */
  nonGoals: string[];
  /** Acceptance criteria for the entire plan. */
  acceptanceCriteria: string[];
  /** Top-level risks and mitigations. */
  risks: Risk[];
  /** Ordered list of phases. */
  phases: PhaseOutline[];
}

// ---------------------------------------------------------------------------
// Phase milestone (from pass 2 — per-phase detail)
// ---------------------------------------------------------------------------

/** A fully detailed milestone within a phase. */
export interface PhaseMilestone {
  /** Title of the milestone. */
  title: string;
  /** What this milestone accomplishes and why. */
  intent: string;
  /** Key files to create or modify. */
  keyFiles: string[];
  /** Verification command(s) to confirm the milestone is complete. */
  verification: string;
  /** Detailed implementation description. */
  details: string;
}

// ---------------------------------------------------------------------------
// Blueprint phase (pass 2 output — one per phase)
// ---------------------------------------------------------------------------

/** A fully detailed phase produced by the second LLM pass. */
export interface BlueprintPhase {
  /** Title of the phase. */
  title: string;
  /** Intent / purpose of the phase. */
  intent: string;
  /** Ordered milestones within this phase. */
  milestones: PhaseMilestone[];
}

// ---------------------------------------------------------------------------
// Hierarchical blueprint (full assembled result)
// ---------------------------------------------------------------------------

/** The complete hierarchical blueprint — master plan + all detailed phases. */
export interface HierarchicalBlueprint {
  /** The master plan. */
  plan: MasterPlanOutline;
  /** Fully detailed phases with milestones. */
  phases: BlueprintPhase[];
}

// ---------------------------------------------------------------------------
// Legacy types (kept temporarily for backward compat during migration)
// ---------------------------------------------------------------------------

/** @deprecated Use PhaseMilestone instead. */
export interface ModuleChange {
  module: string;
  action: "add" | "modify" | "remove" | "move";
  description: string;
}

/** @deprecated Use HierarchicalBlueprint instead. */
export interface BlueprintProposal {
  title: string;
  subsystem: string;
  summary: string;
  proposedArchitecture: string;
  moduleChanges: ModuleChange[];
  migrationPath: string;
  risks: Risk[];
  rationale: string;
}

/** @deprecated No longer needed with hierarchical blueprints. */
export interface GapFinding {
  title: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  category: "gap";
}
