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

// Blueprint
export {
  type BlueprintProposal,
  type ModuleChange,
  type Risk,
  type GapFinding,
} from "./blueprint/types.js";

export { generateBlueprints, parseBlueprintProposals, type BlueprintOptions } from "./blueprint/generator.js";
export { splitBySubsystem, type SubsystemGroup } from "./blueprint/splitter.js";

// CLI is invoked directly via its entry point; no need to re-export here.
// The cli/index.ts file is the bin entry.
