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
