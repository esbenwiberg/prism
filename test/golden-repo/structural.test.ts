/**
 * Golden Repo integration tests -- Structural Layer.
 *
 * Validates file discovery, symbol extraction, dependency graph
 * construction, and metrics computation against a known-good fixture
 * codebase at test/fixtures/golden-repo/.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { resolve } from "node:path";

import {
  walkProjectFiles,
  initTreeSitter,
  parseSource,
  extractSymbols,
  extractDependencies,
  computeComplexity,
  computeFileMetrics,
  type FileEntry,
  type StructuralFileResult,
  type DependencyEdge,
  type ExtractedSymbol,
} from "../../packages/core/src/indexer/index.js";

const GOLDEN_REPO = resolve(__dirname, "../fixtures/golden-repo");

// ---------------------------------------------------------------------------
// Shared state built once across all structural tests
// ---------------------------------------------------------------------------

let files: FileEntry[];
let tsFiles: FileEntry[];
let results: StructuralFileResult[];
let allDeps: DependencyEdge[];
let projectFileSet: Set<string>;

beforeAll(async () => {
  // 1. Walk the project
  files = await walkProjectFiles(GOLDEN_REPO, ["node_modules/**", ".git/**"], 1_048_576);
  tsFiles = files.filter((f) => f.language === "typescript");
  projectFileSet = new Set(files.map((f) => f.path));

  // 2. Parse each TS file
  await initTreeSitter();

  results = [];
  for (const file of tsFiles) {
    const tree = await parseSource(file.content, file.language!);
    const symbols = extractSymbols(tree.rootNode, file.language!, file.content);
    const dependencies = extractDependencies(
      tree.rootNode,
      file.language!,
      file.path,
      projectFileSet,
    );
    const complexity = computeComplexity(tree.rootNode, file.language!);
    tree.delete();

    results.push({ file, symbols, dependencies, complexity });
  }

  allDeps = results.flatMap((r) => r.dependencies);
}, 30_000);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resultFor(name: string): StructuralFileResult {
  const match = results.find((r) => r.file.path.endsWith(name));
  if (!match) throw new Error(`No result for file ending with "${name}"`);
  return match;
}

function symbolsOfKind(result: StructuralFileResult, kind: string): ExtractedSymbol[] {
  return result.symbols.filter((s) => s.kind === kind);
}

function resolvedTargets(result: StructuralFileResult): string[] {
  return result.dependencies
    .filter((d) => d.targetFile !== null)
    .map((d) => d.targetFile!);
}

// ===================================================================
// File detection
// ===================================================================

describe("Golden Repo -- Structural Layer: File Detection", () => {
  it("discovers all 13 TypeScript source files", () => {
    // The golden repo has exactly 13 .ts files under src/
    expect(tsFiles.length).toBe(13);
  });

  it("discovers non-TS files (README, package.json, tsconfig)", () => {
    const nonTs = files.filter((f) => f.language === null);
    const names = nonTs.map((f) => f.path);
    expect(names).toContain("package.json");
    expect(names).toContain("tsconfig.json");
    expect(names).toContain("README.md");
  });

  it("detects typescript language for all .ts files", () => {
    for (const f of tsFiles) {
      expect(f.language).toBe("typescript");
    }
  });

  it("computes correct line counts (non-zero for every file)", () => {
    for (const f of files) {
      expect(f.lineCount).toBeGreaterThan(0);
    }
  });

  it("computes content hashes for all files", () => {
    for (const f of files) {
      // SHA-256 hex digest is always 64 chars
      expect(f.contentHash).toHaveLength(64);
    }
  });
});

// ===================================================================
// Symbol extraction
// ===================================================================

describe("Golden Repo -- Structural Layer: Symbol Extraction", () => {
  it("extracts exported functions from auth-service.ts", () => {
    const r = resultFor("auth-service.ts");
    const fns = symbolsOfKind(r, "function").filter((s) => s.exported);
    const names = fns.map((s) => s.name);
    expect(names).toContain("authenticate");
    expect(names).toContain("refreshTokenIfNeeded");
    expect(names).toContain("authorize");
    expect(names).toContain("logout");
    expect(names).toContain("logoutAllSessions");
    expect(fns.length).toBe(5);
  });

  it("extracts the AuthResult interface from auth-service.ts", () => {
    const r = resultFor("auth-service.ts");
    const ifaces = symbolsOfKind(r, "interface").filter((s) => s.exported);
    expect(ifaces.map((s) => s.name)).toContain("AuthResult");
  });

  it("extracts interfaces only (no functions) from models.ts", () => {
    const r = resultFor("models.ts");
    const fns = symbolsOfKind(r, "function");
    const types = r.symbols.filter(
      (s) => s.kind === "interface" || s.kind === "type",
    );
    expect(fns.length).toBe(0);
    expect(types.length).toBeGreaterThanOrEqual(6); // User, Session, TokenPayload, AuthCredentials, ApiResponse, PaginationParams, PaginatedResult
  });

  it("extracts 15+ exported functions from handlers.ts (god module)", () => {
    const r = resultFor("handlers.ts");
    const exportedFns = symbolsOfKind(r, "function").filter((s) => s.exported);
    expect(exportedFns.length).toBeGreaterThanOrEqual(15);
  });

  it("extracts pure functions from token-validator.ts", () => {
    const r = resultFor("token-validator.ts");
    const fns = symbolsOfKind(r, "function").filter((s) => s.exported);
    const names = fns.map((s) => s.name);
    expect(names).toContain("isTokenExpired");
    expect(names).toContain("hasRequiredRole");
    expect(names).toContain("validateTokenStructure");
    expect(names).toContain("extractSubject");
    expect(names).toContain("isTokenIssuedBefore");
  });

  it("extracts the DecodedToken interface from token-validator.ts", () => {
    const r = resultFor("token-validator.ts");
    const ifaces = symbolsOfKind(r, "interface").filter((s) => s.exported);
    expect(ifaces.map((s) => s.name)).toContain("DecodedToken");
  });

  it("extracts exported functions from dead-code.ts", () => {
    const r = resultFor("dead-code.ts");
    const fns = symbolsOfKind(r, "function").filter((s) => s.exported);
    expect(fns.length).toBe(3); // calculateLevenshteinDistance, generateSlug, deepClone
  });

  it("extracts logger functions from logger.ts", () => {
    const r = resultFor("logger.ts");
    const fns = symbolsOfKind(r, "function").filter((s) => s.exported);
    const names = fns.map((s) => s.name);
    expect(names).toContain("info");
    expect(names).toContain("warn");
    expect(names).toContain("error");
    expect(names).toContain("debug");
    expect(names).toContain("log");
    expect(names).toContain("setLogLevel");
  });
});

// ===================================================================
// Dependency graph
// ===================================================================

describe("Golden Repo -- Structural Layer: Dependency Graph", () => {
  it("auth-service imports from token-validator, session-store, middleware, logger (4 deps)", () => {
    const r = resultFor("auth-service.ts");
    const targets = resolvedTargets(r);
    expect(targets).toContain("src/auth/token-validator.ts");
    expect(targets).toContain("src/auth/session-store.ts");
    expect(targets).toContain("src/api/middleware.ts");
    expect(targets).toContain("src/utils/logger.ts");
    expect(targets.length).toBeGreaterThanOrEqual(4);
  });

  it("connection.ts is imported by user-repository and session-store", () => {
    const connectionPath = "src/db/connection.ts";
    const importers = allDeps
      .filter((d) => d.targetFile === connectionPath)
      .map((d) => d.sourceFile);
    const uniqueImporters = [...new Set(importers)];
    expect(uniqueImporters).toContain("src/db/user-repository.ts");
    expect(uniqueImporters).toContain("src/auth/session-store.ts");
  });

  it("detects bidirectional edges between middleware and auth-service (circular dep)", () => {
    // middleware imports auth-service
    const middlewareDeps = resultFor("middleware.ts").dependencies;
    const middlewareImportsAuth = middlewareDeps.some(
      (d) => d.targetFile === "src/auth/auth-service.ts",
    );
    expect(middlewareImportsAuth).toBe(true);

    // auth-service imports middleware
    const authDeps = resultFor("auth-service.ts").dependencies;
    const authImportsMiddleware = authDeps.some(
      (d) => d.targetFile === "src/api/middleware.ts",
    );
    expect(authImportsMiddleware).toBe(true);
  });

  it("dead-code.ts has zero resolved internal dependencies", () => {
    const r = resultFor("dead-code.ts");
    const internalDeps = r.dependencies.filter((d) => d.targetFile !== null);
    expect(internalDeps.length).toBe(0);
  });

  it("dead-code.ts is not imported by any other file", () => {
    const importers = allDeps.filter(
      (d) => d.targetFile === "src/utils/dead-code.ts",
    );
    expect(importers.length).toBe(0);
  });

  it("token-validator.ts has zero outgoing dependencies", () => {
    const r = resultFor("token-validator.ts");
    // token-validator has no import statements at all
    const internalDeps = r.dependencies.filter((d) => d.targetFile !== null);
    expect(internalDeps.length).toBe(0);
  });

  it("logger.ts has zero outgoing internal dependencies (leaf node)", () => {
    const r = resultFor("logger.ts");
    const internalDeps = r.dependencies.filter((d) => d.targetFile !== null);
    expect(internalDeps.length).toBe(0);
  });

  it("logger.ts is imported by 4+ files", () => {
    const importers = allDeps
      .filter((d) => d.targetFile === "src/utils/logger.ts")
      .map((d) => d.sourceFile);
    const unique = [...new Set(importers)];
    expect(unique.length).toBeGreaterThanOrEqual(4);
  });

  it("routes.ts imports from auth-service, user-repository, and logger", () => {
    const r = resultFor("routes.ts");
    const targets = resolvedTargets(r);
    expect(targets).toContain("src/auth/auth-service.ts");
    expect(targets).toContain("src/db/user-repository.ts");
    expect(targets).toContain("src/utils/logger.ts");
  });

  it("models.ts has zero outgoing dependencies", () => {
    const r = resultFor("models.ts");
    expect(r.dependencies.length).toBe(0);
  });

  it("handlers.ts depends only on logger and helpers", () => {
    const r = resultFor("handlers.ts");
    const targets = resolvedTargets(r);
    expect(targets).toContain("src/utils/logger.ts");
    expect(targets).toContain("src/utils/helpers.ts");
    expect(targets.length).toBe(2);
  });

  it("index.ts (entry point) imports from connection, routes, middleware, logger", () => {
    const r = resultFor("index.ts");
    const targets = resolvedTargets(r);
    expect(targets).toContain("src/db/connection.ts");
    expect(targets).toContain("src/api/routes.ts");
    expect(targets).toContain("src/api/middleware.ts");
    expect(targets).toContain("src/utils/logger.ts");
  });
});

// ===================================================================
// Metrics
// ===================================================================

describe("Golden Repo -- Structural Layer: Metrics", () => {
  it("token-validator.ts has low complexity (pure functions)", () => {
    const r = resultFor("token-validator.ts");
    // Pure boolean functions, minimal branching - expect low complexity
    expect(r.complexity).toBeLessThan(10);
  });

  it("handlers.ts has high complexity (god module with many switch/if branches)", () => {
    const r = resultFor("handlers.ts");
    // 15+ functions each with switch/if branches - expect high complexity
    expect(r.complexity).toBeGreaterThan(20);
  });

  it("dead-code.ts has moderate complexity (nested loops in levenshtein)", () => {
    const r = resultFor("dead-code.ts");
    expect(r.complexity).toBeGreaterThan(1);
    expect(r.complexity).toBeLessThan(20);
  });

  it("connection.ts efferent coupling is 1 (only imports logger)", () => {
    const r = resultFor("connection.ts");
    const metrics = computeFileMetrics(r.file.path, r.dependencies, allDeps, r.symbols);
    expect(metrics.efferentCoupling).toBe(1);
  });

  it("connection.ts afferent coupling is >= 2 (user-repository, session-store import it)", () => {
    const r = resultFor("connection.ts");
    const metrics = computeFileMetrics(r.file.path, r.dependencies, allDeps, r.symbols);
    expect(metrics.afferentCoupling).toBeGreaterThanOrEqual(2);
  });

  it("auth-service.ts has high efferent coupling (4 imports)", () => {
    const r = resultFor("auth-service.ts");
    const metrics = computeFileMetrics(r.file.path, r.dependencies, allDeps, r.symbols);
    expect(metrics.efferentCoupling).toBeGreaterThanOrEqual(4);
  });

  it("token-validator.ts has zero efferent coupling (no imports)", () => {
    const r = resultFor("token-validator.ts");
    const metrics = computeFileMetrics(r.file.path, r.dependencies, allDeps, r.symbols);
    expect(metrics.efferentCoupling).toBe(0);
  });

  it("logger.ts has higher cohesion than handlers.ts", () => {
    const loggerResult = resultFor("logger.ts");
    const handlersResult = resultFor("handlers.ts");
    const loggerMetrics = computeFileMetrics(
      loggerResult.file.path, loggerResult.dependencies, allDeps, loggerResult.symbols,
    );
    const handlersMetrics = computeFileMetrics(
      handlersResult.file.path, handlersResult.dependencies, allDeps, handlersResult.symbols,
    );
    // Logger has zero external deps and many related symbols => higher cohesion
    expect(loggerMetrics.cohesion).toBeGreaterThanOrEqual(handlersMetrics.cohesion);
  });

  it("models.ts has perfect cohesion (zero deps, all type definitions)", () => {
    const r = resultFor("models.ts");
    const metrics = computeFileMetrics(r.file.path, r.dependencies, allDeps, r.symbols);
    // Zero efferent deps and positive symbol count => cohesion should be 1.0
    expect(metrics.cohesion).toBe(1);
  });
});
