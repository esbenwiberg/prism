/**
 * Tests for the HTTP API routes (api.ts).
 *
 * Verifies request validation, index status guards, error handling,
 * and correct delegation to core functions.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock @prism/core
// ---------------------------------------------------------------------------

const mockGetProjectBySlug = vi.fn();
const mockGetConfig = vi.fn(() => ({
  semantic: {
    enabled: true,
    model: "claude-haiku-4-5-20251001",
    embeddingProvider: "voyage",
    embeddingModel: "voyage-code-3",
    embeddingDimensions: 3072,
    budgetUsd: 10,
  },
}));
const mockCreateEmbedder = vi.fn(() => ({
  name: "test",
  model: "test-model",
  embed: vi.fn(async () => [[0.1, 0.2, 0.3]]),
}));
const mockSimilaritySearch = vi.fn(async () => []);
const mockGetFindingsByProjectId = vi.fn(async () => []);
const mockUpsertReindexRequest = vi.fn(async () => ({}));
const mockDeleteProject = vi.fn(async () => {});
const mockAssembleFileContext = vi.fn(async () => ({
  sections: [],
  totalTokens: 0,
  truncated: false,
}));
const mockAssembleModuleContext = vi.fn(async () => ({
  sections: [],
  totalTokens: 0,
  truncated: false,
}));
const mockAssembleRelatedFiles = vi.fn(async () => []);
const mockAssembleArchitectureOverview = vi.fn(async () => ({
  sections: [],
  totalTokens: 0,
  truncated: false,
}));
const mockAssembleChangeContext = vi.fn(async () => ({
  sections: [],
  totalTokens: 0,
  truncated: false,
}));
const mockAssembleReviewContext = vi.fn(async () => ({
  sections: [],
  totalTokens: 0,
  truncated: false,
}));
const mockAssembleTaskContext = vi.fn(async () => ({
  sections: [{ heading: "Relevant Code", priority: 2, content: "test", tokenCount: 5 }],
  totalTokens: 5,
  truncated: false,
}));
const mockFormatContextAsMarkdown = vi.fn(() => "# Context\n");

vi.mock("@prism/core", () => ({
  getProjectBySlug: (...args: unknown[]) => mockGetProjectBySlug(...args),
  getConfig: (...args: unknown[]) => mockGetConfig(...args),
  createEmbedder: (...args: unknown[]) => mockCreateEmbedder(...args),
  similaritySearch: (...args: unknown[]) => mockSimilaritySearch(...args),
  getFindingsByProjectId: (...args: unknown[]) => mockGetFindingsByProjectId(...args),
  upsertReindexRequest: (...args: unknown[]) => mockUpsertReindexRequest(...args),
  deleteProject: (...args: unknown[]) => mockDeleteProject(...args),
  assembleFileContext: (...args: unknown[]) => mockAssembleFileContext(...args),
  assembleModuleContext: (...args: unknown[]) => mockAssembleModuleContext(...args),
  assembleRelatedFiles: (...args: unknown[]) => mockAssembleRelatedFiles(...args),
  assembleArchitectureOverview: (...args: unknown[]) => mockAssembleArchitectureOverview(...args),
  assembleChangeContext: (...args: unknown[]) => mockAssembleChangeContext(...args),
  assembleReviewContext: (...args: unknown[]) => mockAssembleReviewContext(...args),
  assembleTaskContext: (...args: unknown[]) => mockAssembleTaskContext(...args),
  formatContextAsMarkdown: (...args: unknown[]) => mockFormatContextAsMarkdown(...args),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock the auth middleware to always pass
vi.mock("../../auth/api-key.js", () => ({
  requireApiKey: (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Import after mocks
import { apiRouter } from "./api.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Walk an Express Router's layer stack and call the matching handler.
 * This avoids needing supertest while still exercising the real route code.
 */
async function callRoute(
  method: string,
  path: string,
  body: Record<string, unknown> = {},
  query: Record<string, string> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const params: Record<string, string> = {};

  // Parse owner/repo from path like /api/projects/owner/repo/context/enrich
  const parts = path.split("/");
  if (parts.length >= 5 && parts[1] === "api" && parts[2] === "projects") {
    params.owner = parts[3];
    params.repo = parts[4];
  }

  const req = {
    method: method.toUpperCase(),
    path,
    params,
    body,
    query,
    headers: {},
  };

  let responseStatus = 200;
  let responseBody: Record<string, unknown> = {};

  const res = {
    status(code: number) {
      responseStatus = code;
      return res;
    },
    json(data: Record<string, unknown>) {
      responseBody = data;
      return res;
    },
    send(data: unknown) {
      responseBody = typeof data === "string" ? { _raw: data } : (data as Record<string, unknown>);
      return res;
    },
  };

  // Find matching handler in the router stack
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stack = (apiRouter as any).stack;

  for (const layer of stack) {
    if (!layer.route) continue;
    const route = layer.route;

    if (!route.methods[method.toLowerCase()]) continue;

    const routePattern = route.path
      .replace(/:owner/g, "([^/]+)")
      .replace(/:repo/g, "([^/]+)");
    const regex = new RegExp(`^${routePattern}$`);
    if (!regex.test(path)) continue;

    // Found matching route — run handlers sequentially
    for (const handler of route.stack) {
      await new Promise<void>((resolve) => {
        const result = handler.handle(req, res, () => resolve());
        if (result instanceof Promise) result.then(() => resolve()).catch(() => resolve());
        setTimeout(resolve, 10);
      });
    }
    break;
  }

  return { status: responseStatus, body: responseBody };
}

const INDEXED_PROJECT = {
  id: 1,
  name: "test-project",
  path: "/repos/owner/repo",
  slug: "owner/repo",
  indexStatus: "completed",
};

const UNINDEXED_PROJECT = {
  id: 2,
  name: "pending-project",
  path: "/repos/owner/pending",
  slug: "owner/pending",
  indexStatus: "pending",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // POST /api/projects/:owner/:repo/search
  // -------------------------------------------------------------------------

  describe("POST /search", () => {
    it("returns 404 when project not found", async () => {
      mockGetProjectBySlug.mockResolvedValue(null);
      const { status, body } = await callRoute("post", "/api/projects/owner/repo/search", { query: "test" });
      expect(status).toBe(404);
      expect(body.error).toBe("Project not found");
    });

    it("returns 404 when project not yet indexed", async () => {
      mockGetProjectBySlug.mockResolvedValue(UNINDEXED_PROJECT);
      const { status, body } = await callRoute("post", "/api/projects/owner/pending/search", { query: "test" });
      expect(status).toBe(404);
      expect(body.error).toBe("Project not yet indexed");
    });

    it("returns 400 when query is missing", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      const { status, body } = await callRoute("post", "/api/projects/owner/repo/search", {});
      expect(status).toBe(400);
      expect(body.error).toContain("query");
    });

    it("returns results for valid query", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      mockSimilaritySearch.mockResolvedValue([
        {
          embeddingId: 1,
          distance: 0.1,
          score: 0.9,
          summaryContent: "Test file summary",
          targetId: "file:src/test.ts",
          level: "file",
          filePath: "src/test.ts",
          symbolName: "testFn",
          symbolKind: "function",
        },
      ]);

      const { status, body } = await callRoute("post", "/api/projects/owner/repo/search", { query: "test" });
      expect(status).toBe(200);
      expect(body.relevantCode).toBeDefined();
      expect(body.moduleSummaries).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/projects/:owner/:repo/findings
  // -------------------------------------------------------------------------

  describe("GET /findings", () => {
    it("returns 404 when project not found", async () => {
      mockGetProjectBySlug.mockResolvedValue(null);
      const { status } = await callRoute("get", "/api/projects/owner/repo/findings");
      expect(status).toBe(404);
    });

    it("returns findings for indexed project", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      mockGetFindingsByProjectId.mockResolvedValue([
        {
          id: 1,
          projectId: 1,
          category: "dead-code",
          severity: "medium",
          title: "Unused function",
          description: "This function is never called",
          suggestion: "Remove it",
        },
      ]);

      const { status, body } = await callRoute("get", "/api/projects/owner/repo/findings");
      expect(status).toBe(200);
      const findings = body.findings as Array<{ title: string }>;
      expect(findings).toHaveLength(1);
      expect(findings[0].title).toBe("Unused function");
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/projects/:owner/:repo/reindex
  // -------------------------------------------------------------------------

  describe("POST /reindex", () => {
    it("returns 404 when project not found", async () => {
      mockGetProjectBySlug.mockResolvedValue(null);
      const { status } = await callRoute("post", "/api/projects/owner/repo/reindex", { layers: ["structural"] });
      expect(status).toBe(404);
    });

    it("returns 400 for invalid layers", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      const { status, body } = await callRoute("post", "/api/projects/owner/repo/reindex", { layers: ["invalid"] });
      expect(status).toBe(400);
      expect(body.error).toContain("Invalid layer");
    });

    it("queues reindex for valid request", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      const { status, body } = await callRoute("post", "/api/projects/owner/repo/reindex", { layers: ["structural"] });
      expect(status).toBe(202);
      expect(body.queued).toBe(true);
      expect(mockUpsertReindexRequest).toHaveBeenCalledWith(1, ["structural"]);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/projects/:owner/:repo
  // -------------------------------------------------------------------------

  describe("DELETE /project", () => {
    it("returns 404 when project not found", async () => {
      mockGetProjectBySlug.mockResolvedValue(null);
      const { status } = await callRoute("delete", "/api/projects/owner/repo");
      expect(status).toBe(404);
    });

    it("deletes existing project", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      const { status, body } = await callRoute("delete", "/api/projects/owner/repo");
      expect(status).toBe(200);
      expect(body.deleted).toBe(true);
      expect(mockDeleteProject).toHaveBeenCalledWith(1);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/projects/:owner/:repo/context/enrich
  // -------------------------------------------------------------------------

  describe("POST /context/enrich", () => {
    it("returns 404 when project not found", async () => {
      mockGetProjectBySlug.mockResolvedValue(null);
      const { status, body } = await callRoute("post", "/api/projects/owner/repo/context/enrich", { query: "test" });
      expect(status).toBe(404);
      expect(body.error).toBe("Project not found");
    });

    it("returns 404 when project not yet indexed", async () => {
      mockGetProjectBySlug.mockResolvedValue(UNINDEXED_PROJECT);
      const { status, body } = await callRoute("post", "/api/projects/owner/pending/context/enrich", { query: "test" });
      expect(status).toBe(404);
      expect(body.error).toBe("Project not yet indexed");
    });

    it("returns 400 when query is missing", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      const { status, body } = await callRoute("post", "/api/projects/owner/repo/context/enrich", {});
      expect(status).toBe(400);
      expect(body.error).toContain("query");
    });

    it("returns 400 when query is not a string", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      const { status } = await callRoute("post", "/api/projects/owner/repo/context/enrich", { query: 123 });
      expect(status).toBe(400);
    });

    it("returns context for valid indexed project", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      const { status, body } = await callRoute("post", "/api/projects/owner/repo/context/enrich", {
        query: "how does auth work?",
      });

      expect(status).toBe(200);
      expect(body.sections).toBeDefined();
      expect(body.totalTokens).toBeDefined();
      expect(mockAssembleTaskContext).toHaveBeenCalledWith({
        projectId: 1,
        query: "how does auth work?",
        maxTokens: undefined,
      });
    });

    it("passes maxTokens to assembler", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      await callRoute("post", "/api/projects/owner/repo/context/enrich", { query: "test", maxTokens: 8000 });
      expect(mockAssembleTaskContext).toHaveBeenCalledWith({
        projectId: 1,
        query: "test",
        maxTokens: 8000,
      });
    });

    it("returns 500 with detail when assembly throws", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      mockAssembleTaskContext.mockRejectedValue(
        new Error("VOYAGE_API_KEY environment variable is required"),
      );

      const { status, body } = await callRoute("post", "/api/projects/owner/repo/context/enrich", { query: "test" });
      expect(status).toBe(500);
      expect(body.error).toBe("Context assembly failed");
      expect(body.detail).toContain("VOYAGE_API_KEY");
    });

    it("works for projects with partial index status", async () => {
      mockGetProjectBySlug.mockResolvedValue({
        ...INDEXED_PROJECT,
        indexStatus: "partial",
      });
      mockAssembleTaskContext.mockResolvedValue({
        sections: [],
        totalTokens: 0,
        truncated: false,
      });

      const { status } = await callRoute("post", "/api/projects/owner/repo/context/enrich", { query: "test" });
      expect(status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/projects/:owner/:repo/context/file
  // -------------------------------------------------------------------------

  describe("POST /context/file", () => {
    it("returns 404 when project not indexed", async () => {
      mockGetProjectBySlug.mockResolvedValue(UNINDEXED_PROJECT);
      const { status, body } = await callRoute("post", "/api/projects/owner/pending/context/file", {
        filePath: "src/index.ts",
      });
      expect(status).toBe(404);
      expect(body.error).toBe("Project not yet indexed");
    });

    it("returns 400 when filePath is missing", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      const { status, body } = await callRoute("post", "/api/projects/owner/repo/context/file", {});
      expect(status).toBe(400);
      expect(body.error).toContain("filePath");
    });

    it("returns context for valid file request", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      const { status } = await callRoute("post", "/api/projects/owner/repo/context/file", {
        filePath: "src/index.ts",
      });
      expect(status).toBe(200);
      expect(mockAssembleFileContext).toHaveBeenCalledWith({
        projectId: 1,
        filePath: "src/index.ts",
        intent: undefined,
        maxTokens: undefined,
      });
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/projects/:owner/:repo/context/module
  // -------------------------------------------------------------------------

  describe("POST /context/module", () => {
    it("returns 404 when project not indexed", async () => {
      mockGetProjectBySlug.mockResolvedValue(UNINDEXED_PROJECT);
      const { status, body } = await callRoute("post", "/api/projects/owner/pending/context/module", {
        modulePath: "src/auth",
      });
      expect(status).toBe(404);
      expect(body.error).toBe("Project not yet indexed");
    });

    it("returns 400 when modulePath is missing", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      const { status } = await callRoute("post", "/api/projects/owner/repo/context/module", {});
      expect(status).toBe(400);
    });

    it("returns context for valid module request", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      const { status } = await callRoute("post", "/api/projects/owner/repo/context/module", {
        modulePath: "src/auth",
      });
      expect(status).toBe(200);
      expect(mockAssembleModuleContext).toHaveBeenCalledWith({
        projectId: 1,
        modulePath: "src/auth",
        maxTokens: undefined,
      });
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/projects/:owner/:repo/context/related
  // -------------------------------------------------------------------------

  describe("POST /context/related", () => {
    it("returns 404 when project not indexed", async () => {
      mockGetProjectBySlug.mockResolvedValue(UNINDEXED_PROJECT);
      const { status, body } = await callRoute("post", "/api/projects/owner/pending/context/related", {
        query: "auth",
      });
      expect(status).toBe(404);
      expect(body.error).toBe("Project not yet indexed");
    });

    it("returns 400 when query is missing", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      const { status } = await callRoute("post", "/api/projects/owner/repo/context/related", {});
      expect(status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/projects/:owner/:repo/context/arch
  // -------------------------------------------------------------------------

  describe("POST /context/arch", () => {
    it("returns 404 when project not indexed", async () => {
      mockGetProjectBySlug.mockResolvedValue(UNINDEXED_PROJECT);
      const { status, body } = await callRoute("post", "/api/projects/owner/pending/context/arch", {});
      expect(status).toBe(404);
      expect(body.error).toBe("Project not yet indexed");
    });

    it("returns architecture context for indexed project", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      const { status } = await callRoute("post", "/api/projects/owner/repo/context/arch", {});
      expect(status).toBe(200);
      expect(mockAssembleArchitectureOverview).toHaveBeenCalledWith({
        projectId: 1,
        maxTokens: undefined,
      });
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/projects/:owner/:repo/context/changes
  // -------------------------------------------------------------------------

  describe("POST /context/changes", () => {
    it("returns 404 when project not indexed", async () => {
      mockGetProjectBySlug.mockResolvedValue(UNINDEXED_PROJECT);
      const { status, body } = await callRoute("post", "/api/projects/owner/pending/context/changes", {});
      expect(status).toBe(404);
      expect(body.error).toBe("Project not yet indexed");
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/projects/:owner/:repo/context/review
  // -------------------------------------------------------------------------

  describe("POST /context/review", () => {
    it("returns 404 when project not indexed", async () => {
      mockGetProjectBySlug.mockResolvedValue(UNINDEXED_PROJECT);
      const { status, body } = await callRoute("post", "/api/projects/owner/pending/context/review", {
        since: "2024-01-01",
      });
      expect(status).toBe(404);
      expect(body.error).toBe("Project not yet indexed");
    });

    it("returns 400 when since is missing", async () => {
      mockGetProjectBySlug.mockResolvedValue(INDEXED_PROJECT);
      const { status, body } = await callRoute("post", "/api/projects/owner/repo/context/review", {});
      expect(status).toBe(400);
      expect(body.error).toContain("since");
    });
  });
});
