/**
 * Tests for the worker executor — job dispatch by type.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @prism/core
// ---------------------------------------------------------------------------

vi.mock("@prism/core", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  getProject: vi.fn(),
  getCredential: vi.fn(),
  updateProject: vi.fn(),
  cloneRepo: vi.fn(),
  cleanupClone: vi.fn(),
  cloneDestination: vi.fn((id: number) => `/tmp/prism-clones/${id}`),
  decryptToken: vi.fn(),
  runPipeline: vi.fn(),
  initConfig: vi.fn(() => ({
    blueprint: { enabled: true, model: "claude-3-5-sonnet-20241022", budgetUsd: 1.0 },
  })),
  createBudgetTracker: vi.fn(() => ({
    budgetUsd: 1.0,
    spentUsd: 0,
    exceeded: false,
    record: vi.fn(),
  })),
}));

// Mock the blueprint generator
vi.mock("../blueprint/generator.js", () => ({
  generateHierarchicalBlueprint: vi.fn(),
}));

// Import after mocks
import { executeJob } from "./executor.js";
import {
  getProject,
  getCredential,
  updateProject,
  cloneRepo,
  cleanupClone,
  decryptToken,
  runPipeline,
} from "@prism/core";
import { generateHierarchicalBlueprint } from "../blueprint/generator.js";

const mockGetProject = vi.mocked(getProject);
const mockGetCredential = vi.mocked(getCredential);
const mockUpdateProject = vi.mocked(updateProject);
const mockCloneRepo = vi.mocked(cloneRepo);
const mockCleanupClone = vi.mocked(cleanupClone);
const mockDecryptToken = vi.mocked(decryptToken);
const mockRunPipeline = vi.mocked(runPipeline);
const mockGenerateBlueprint = vi.mocked(generateHierarchicalBlueprint);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(overrides: Partial<{
  id: number;
  projectId: number;
  type: string;
  status: string;
  options: Record<string, unknown> | null;
  error: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}> = {}) {
  return {
    id: 1,
    projectId: 42,
    type: "index",
    status: "running",
    options: null,
    error: null,
    createdAt: new Date(),
    startedAt: new Date(),
    completedAt: null,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 42,
    name: "test-project",
    path: "/old/path",
    language: null,
    totalFiles: null,
    totalSymbols: null,
    indexStatus: "pending" as const,
    lastIndexedCommit: null,
    settings: null,
    gitUrl: "https://github.com/org/repo.git",
    credentialId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("executeJob — index type", () => {
  it("clones, updates project path, runs pipeline, and cleans up", async () => {
    const project = makeProject();
    mockGetProject
      .mockResolvedValueOnce(project as any) // initial fetch
      .mockResolvedValueOnce({ ...project, path: "/tmp/prism-clones/42" } as any); // re-fetch after update
    mockCloneRepo.mockResolvedValue({ destDir: "/tmp/prism-clones/42", url: "***" });
    mockUpdateProject.mockResolvedValue(undefined);
    mockRunPipeline.mockResolvedValue([]);
    mockCleanupClone.mockResolvedValue(undefined);

    const result = await executeJob(makeJob({ type: "index" }));

    expect(result.success).toBe(true);
    expect(mockCloneRepo).toHaveBeenCalledWith(
      "https://github.com/org/repo.git",
      "/tmp/prism-clones/42",
      { pat: undefined, provider: undefined },
    );
    expect(mockUpdateProject).toHaveBeenCalledWith(42, { path: "/tmp/prism-clones/42" });
    expect(mockRunPipeline).toHaveBeenCalled();
    expect(mockCleanupClone).toHaveBeenCalledWith("/tmp/prism-clones/42");
  });

  it("cleans up clone directory even on pipeline failure", async () => {
    const project = makeProject();
    mockGetProject
      .mockResolvedValueOnce(project as any)
      .mockResolvedValueOnce({ ...project, path: "/tmp/prism-clones/42" } as any);
    mockCloneRepo.mockResolvedValue({ destDir: "/tmp/prism-clones/42", url: "***" });
    mockUpdateProject.mockResolvedValue(undefined);
    mockRunPipeline.mockRejectedValue(new Error("Pipeline exploded"));
    mockCleanupClone.mockResolvedValue(undefined);

    const result = await executeJob(makeJob({ type: "index" }));

    expect(result.success).toBe(false);
    expect(result.error).toContain("Pipeline exploded");
    // Cleanup must still be called
    expect(mockCleanupClone).toHaveBeenCalledWith("/tmp/prism-clones/42");
  });

  it("decrypts credential PAT when project has credentialId", async () => {
    const project = makeProject({ credentialId: 7 });
    mockGetProject
      .mockResolvedValueOnce(project as any)
      .mockResolvedValueOnce({ ...project, path: "/tmp/prism-clones/42" } as any);
    mockGetCredential.mockResolvedValue({
      id: 7,
      label: "my-pat",
      provider: "github",
      encryptedToken: "enc:token:tag",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    mockDecryptToken.mockReturnValue("ghp_abc123");
    process.env.CREDENTIAL_ENCRYPTION_KEY = "a".repeat(64);
    mockCloneRepo.mockResolvedValue({ destDir: "/tmp/prism-clones/42", url: "***" });
    mockUpdateProject.mockResolvedValue(undefined);
    mockRunPipeline.mockResolvedValue([]);
    mockCleanupClone.mockResolvedValue(undefined);

    const result = await executeJob(makeJob({ type: "index" }));

    expect(result.success).toBe(true);
    expect(mockDecryptToken).toHaveBeenCalledWith("enc:token:tag", "a".repeat(64));
    expect(mockCloneRepo).toHaveBeenCalledWith(
      "https://github.com/org/repo.git",
      "/tmp/prism-clones/42",
      { pat: "ghp_abc123", provider: "github" },
    );

    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
  });

  it("returns error if project not found", async () => {
    mockGetProject.mockResolvedValue(undefined);

    const result = await executeJob(makeJob({ type: "index" }));

    expect(result.success).toBe(false);
    expect(result.error).toContain("Project not found");
  });

  it("returns error if project has no git URL", async () => {
    mockGetProject.mockResolvedValue(makeProject({ gitUrl: null }) as any);

    const result = await executeJob(makeJob({ type: "index" }));

    expect(result.success).toBe(false);
    expect(result.error).toContain("no git URL");
  });
});

describe("executeJob — blueprint type", () => {
  it("generates hierarchical blueprint for the project", async () => {
    const project = makeProject();
    mockGetProject.mockResolvedValue(project as any);
    mockGenerateBlueprint.mockResolvedValue(null);

    const result = await executeJob(
      makeJob({
        type: "blueprint",
        options: { goal: "modernize", focus: "src/api" },
      }),
    );

    expect(result.success).toBe(true);
    expect(mockGenerateBlueprint).toHaveBeenCalledWith(
      42,
      "test-project",
      expect.any(Object),
      expect.any(Object),
      { goal: "modernize", focus: "src/api" },
      expect.any(Function),
    );
  });

  it("returns error if project not found", async () => {
    mockGetProject.mockResolvedValue(undefined);

    const result = await executeJob(makeJob({ type: "blueprint" }));

    expect(result.success).toBe(false);
    expect(result.error).toContain("Project not found");
  });
});

describe("executeJob — unknown type", () => {
  it("returns error for unknown job type", async () => {
    const result = await executeJob(makeJob({ type: "unknown" }));

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown job type");
  });
});
