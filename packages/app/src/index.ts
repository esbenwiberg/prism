/**
 * @prism/app — CLI, dashboard, and blueprint generator.
 *
 * This is the barrel export for the app package.
 * Exports will be added as modules are implemented in later milestones.
 */

export { logger } from "@prism/core";

// CLI is invoked directly via its entry point; no need to re-export here.
// The cli/index.ts file is the bin entry.
