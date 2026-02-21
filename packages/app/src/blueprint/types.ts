/**
 * Blueprint domain types for Layer 5 — redesign proposals.
 */

// ---------------------------------------------------------------------------
// Module change
// ---------------------------------------------------------------------------

/** A proposed change to a specific module. */
export interface ModuleChange {
  /** Path of the module (directory or file). */
  module: string;
  /** Kind of change. */
  action: "add" | "modify" | "remove" | "move";
  /** What to change and why. */
  description: string;
}

// ---------------------------------------------------------------------------
// Risk
// ---------------------------------------------------------------------------

/** A risk associated with a blueprint proposal. */
export interface Risk {
  /** Description of the risk. */
  risk: string;
  /** Severity of the risk. */
  severity: "low" | "medium" | "high";
  /** How to mitigate the risk. */
  mitigation: string;
}

// ---------------------------------------------------------------------------
// Blueprint proposal
// ---------------------------------------------------------------------------

/** A structured redesign proposal produced by the blueprint generator. */
export interface BlueprintProposal {
  /** Brief title of the proposal. */
  title: string;
  /** Target subsystem or module. */
  subsystem: string;
  /** 1-2 sentence summary. */
  summary: string;
  /** Detailed description of the target architecture. */
  proposedArchitecture: string;
  /** List of specific module changes. */
  moduleChanges: ModuleChange[];
  /** Step-by-step migration plan. */
  migrationPath: string;
  /** Risks and mitigations. */
  risks: Risk[];
  /** Why this change addresses the identified issues. */
  rationale: string;
}

// ---------------------------------------------------------------------------
// Gap finding (from gap analysis)
// ---------------------------------------------------------------------------

/** A gap identified between documentation and code. */
export interface GapFinding {
  /** Brief title of the gap. */
  title: string;
  /** Detailed description of the discrepancy. */
  description: string;
  /** Severity level. */
  severity: "low" | "medium" | "high" | "critical";
  /** Always "gap" for gap findings. */
  category: "gap";
}
