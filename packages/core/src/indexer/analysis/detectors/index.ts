/**
 * Analysis detectors barrel export.
 */

export {
  findSCCs,
  buildAdjacencyList,
  detectCircularDeps,
  type DepEdge,
  type DetectorFinding,
} from "./circular-deps.js";

export {
  detectDeadCode,
  type SymbolInfo,
  type SymbolReference,
} from "./dead-code.js";

export {
  detectGodModules,
  type FileMetricsInput,
  type GodModuleThresholds,
} from "./god-modules.js";

export {
  detectLayeringViolations,
  detectLayer,
  type LayeringEdge,
} from "./layering.js";

export {
  detectCouplingIssues,
  type CouplingMetricsInput,
  type CouplingThresholds,
} from "./coupling.js";
