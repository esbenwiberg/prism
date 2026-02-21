/**
 * @prism/app — CLI, dashboard, and blueprint generator.
 *
 * This is the barrel export for the app package.
 */

export { logger } from "@prism/core";

// Dashboard
export { createApp, startServer } from "./dashboard/index.js";

// Auth
export { requireAuth, createSessionMiddleware } from "./auth/index.js";

// Blueprint — hierarchical types
export {
  type MasterPlanOutline,
  type PhaseOutline,
  type BlueprintPhase,
  type PhaseMilestone,
  type HierarchicalBlueprint,
  type Risk,
  // Legacy (kept for backward compat during migration)
  type BlueprintProposal,
  type ModuleChange,
  type GapFinding,
} from "./blueprint/types.js";

export {
  generateHierarchicalBlueprint,
  generateBlueprints,
  parseMasterPlanOutline,
  parsePhaseDetail,
  parseBlueprintProposals,
  type BlueprintOptions,
  type HierarchicalBlueprintResult,
} from "./blueprint/generator.js";
export { renderMasterPlanMarkdown, renderPhaseMarkdown, renderFullBlueprintMarkdown } from "./blueprint/markdown.js";
export { splitBySubsystem, type SubsystemGroup } from "./blueprint/splitter.js";

// CLI is invoked directly via its entry point; no need to re-export here.
// The cli/index.ts file is the bin entry.
