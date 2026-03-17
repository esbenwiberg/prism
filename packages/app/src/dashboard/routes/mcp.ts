/**
 * MCP (Model Context Protocol) route handler.
 *
 * Exposes tools via StreamableHTTP transport so Claude Code
 * can connect as a remote MCP server. Direct DB access — no HTTP roundtrip.
 *
 * Route: POST /mcp  (+ GET, DELETE for protocol compliance)
 * Auth:  Bearer token via requireApiKey
 *
 * Every tool that targets a specific project takes a `slug` parameter
 * (owner/repo format) so a single MCP connection can serve all projects.
 *
 * Tools:
 *   search_codebase    (read)     — semantic search
 *   register_project   (register) — register a new project
 *   delete_project     (register) — delete a project and all its data
 *   trigger_reindex    (index)    — enqueue reindex request
 *   get_project_status (read)     — project status overview
 */

import { Router } from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  getProjectBySlug,
  getConfig,
  createEmbedder,
  similaritySearch,
  createProject,
  deleteProject,
  upsertReindexRequest,
  hasActiveJobForProject,
  getLastCompletedIndexTime,
  getProjectFiles,
  logger,
} from "@prism/core";
import { requireApiKey } from "../../auth/api-key.js";

export const mcpRouter = Router();

// ---------------------------------------------------------------------------
// Helpers (ported from packages/mcp)
// ---------------------------------------------------------------------------

interface FormatInput {
  relevantCode: Array<{
    filePath: string | null;
    symbolName: string | null;
    symbolKind: string | null;
    level: string | null;
    summaryContent: string | null;
    score: number;
  }>;
  moduleSummaries: Array<{
    targetId: string;
    summaryContent: string | null;
  }>;
}

function formatResponse(query: string, slug: string, data: FormatInput): string {
  const lines: string[] = [];
  lines.push(`## Prism search: "${query}" (${slug})`, "");

  // Relevant code
  const code = data.relevantCode;
  lines.push(`### Relevant Code (${code.length} results)`);
  if (code.length === 0) {
    lines.push("No relevant code found.");
  } else {
    for (const item of code) {
      const scoreStr = ` [score: ${item.score.toFixed(2)}]`;
      const kindStr = item.symbolKind ? ` (${item.symbolKind})` : "";
      lines.push(`**${item.filePath ?? "unknown"}** — \`${item.symbolName ?? "?"}\`${kindStr}${scoreStr}`);
      const doc = item.summaryContent ?? "";
      if (doc) {
        const truncated = doc.length > 200 ? doc.slice(0, 200) + "…" : doc;
        lines.push(truncated);
      }
      lines.push("");
    }
  }

  // Module summaries
  const summaries = data.moduleSummaries;
  if (summaries.length > 0) {
    lines.push("### Module Summaries");
    for (const mod of summaries) {
      lines.push(`**${mod.targetId}** — ${mod.summaryContent ?? ""}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Per-request MCP server factory
// ---------------------------------------------------------------------------

function createMcpServer(permissions: string[]): Server {
  const server = new Server(
    { name: "prism", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  // Helper: check if caller has a permission, return error text content if not
  function permissionError(required: string): { content: Array<{ type: "text"; text: string }> } | null {
    if (permissions.includes(required)) return null;
    return {
      content: [{ type: "text" as const, text: `Permission denied: this API key lacks the "${required}" permission.` }],
    };
  }

  const slugParam = {
    type: "string" as const,
    description: "Project slug in owner/repo format",
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "search_codebase",
        description:
          "Search the Prism-indexed codebase for relevant code and module summaries.",
        inputSchema: {
          type: "object" as const,
          properties: {
            slug: slugParam,
            query: {
              type: "string",
              description: "Natural language question about the codebase",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of code results to return (default: 15)",
            },
          },
          required: ["slug", "query"],
        },
      },
      {
        name: "register_project",
        description:
          "Register a new project in Prism for indexing. " +
          "Provide a human-readable name and the owner/repo slug. Optionally provide a git URL.",
        inputSchema: {
          type: "object" as const,
          properties: {
            name: {
              type: "string",
              description: "Human-readable project name",
            },
            slug: slugParam,
            gitUrl: {
              type: "string",
              description: "Git clone URL (optional)",
            },
          },
          required: ["name", "slug"],
        },
      },
      {
        name: "delete_project",
        description:
          "Delete a project and all its indexed data from Prism. This action is irreversible.",
        inputSchema: {
          type: "object" as const,
          properties: {
            slug: slugParam,
          },
          required: ["slug"],
        },
      },
      {
        name: "trigger_reindex",
        description:
          "Trigger a reindex of the project. Optionally specify which layers to reindex.",
        inputSchema: {
          type: "object" as const,
          properties: {
            slug: slugParam,
            layers: {
              type: "array",
              items: { type: "string" },
              description: 'Layers to reindex (default: ["structural"]). Valid: "structural", "semantic".',
            },
          },
          required: ["slug"],
        },
      },
      {
        name: "get_project_status",
        description:
          "Get the current status of the project including index status, file count, last index time, and whether an active job is running.",
        inputSchema: {
          type: "object" as const,
          properties: {
            slug: slugParam,
          },
          required: ["slug"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    // -----------------------------------------------------------------------
    // search_codebase
    // -----------------------------------------------------------------------
    if (toolName === "search_codebase") {
      const denied = permissionError("read");
      if (denied) return denied;

      const { slug, query, maxResults = 15 } = args as {
        slug: string;
        query: string;
        maxResults?: number;
      };

      const project = await getProjectBySlug(slug);
      if (!project) {
        return { content: [{ type: "text" as const, text: `Project "${slug}" not found in Prism.` }] };
      }

      if (project.indexStatus !== "completed" && project.indexStatus !== "partial") {
        return { content: [{ type: "text" as const, text: `Project "${slug}" is not yet indexed.` }] };
      }

      try {
        const config = getConfig();
        const embedder = createEmbedder(config.semantic);
        const [queryVector] = await embedder.embed([query]);

        const maxSummaries = 30;
        const searchLimit = maxResults + maxSummaries;
        const allResults = await similaritySearch(project.id, queryVector, searchLimit);

        const relevantCode = allResults
          .filter((r) => r.level !== "module" && r.level !== "system")
          .slice(0, maxResults);

        const moduleSummaries = allResults
          .filter((r) => r.level === "module")
          .slice(0, maxSummaries);

        const text = formatResponse(query, slug, { relevantCode, moduleSummaries });
        return { content: [{ type: "text" as const, text }] };
      } catch (err) {
        logger.error({ slug, error: err instanceof Error ? err.message : String(err) }, "MCP search failed");
        return { content: [{ type: "text" as const, text: `Search failed: ${err instanceof Error ? err.message : String(err)}` }] };
      }
    }

    // -----------------------------------------------------------------------
    // register_project
    // -----------------------------------------------------------------------
    if (toolName === "register_project") {
      const denied = permissionError("register");
      if (denied) return denied;

      const { name, slug, gitUrl } = args as {
        name: string;
        slug: string;
        gitUrl?: string;
      };

      // Check if already registered
      const existing = await getProjectBySlug(slug);
      if (existing) {
        return {
          content: [{ type: "text" as const, text: `Project "${slug}" is already registered (id: ${existing.id}).` }],
        };
      }

      const project = await createProject(name, `remote:${slug}`, {
        slug,
        gitUrl,
      });

      return {
        content: [{
          type: "text" as const,
          text: `Project "${name}" registered successfully (id: ${project.id}, slug: ${slug}).`,
        }],
      };
    }

    // -----------------------------------------------------------------------
    // delete_project
    // -----------------------------------------------------------------------
    if (toolName === "delete_project") {
      const denied = permissionError("register");
      if (denied) return denied;

      const { slug } = args as { slug: string };
      const project = await getProjectBySlug(slug);
      if (!project) {
        return { content: [{ type: "text" as const, text: `Project "${slug}" not found in Prism.` }] };
      }

      await deleteProject(project.id);
      logger.info({ projectId: project.id, slug }, "Project deleted via MCP");

      return {
        content: [{ type: "text" as const, text: `Project "${slug}" (id: ${project.id}) has been deleted.` }],
      };
    }

    // -----------------------------------------------------------------------
    // trigger_reindex
    // -----------------------------------------------------------------------
    if (toolName === "trigger_reindex") {
      const denied = permissionError("index");
      if (denied) return denied;

      const { slug } = args as { slug: string };
      const project = await getProjectBySlug(slug);
      if (!project) {
        return { content: [{ type: "text" as const, text: `Project "${slug}" not found in Prism.` }] };
      }

      const rawLayers = (args.layers as string[] | undefined) ?? ["structural"];
      const validLayers = new Set(["structural", "semantic"]);
      const invalid = rawLayers.filter((l) => !validLayers.has(l));
      if (invalid.length > 0) {
        return {
          content: [{ type: "text" as const, text: `Invalid layer(s): ${invalid.join(", ")}. Valid layers: structural, semantic.` }],
        };
      }

      await upsertReindexRequest(project.id, rawLayers);

      return {
        content: [{
          type: "text" as const,
          text: `Reindex request queued for "${slug}" (layers: ${rawLayers.join(", ")}).`,
        }],
      };
    }

    // -----------------------------------------------------------------------
    // get_project_status
    // -----------------------------------------------------------------------
    if (toolName === "get_project_status") {
      const denied = permissionError("read");
      if (denied) return denied;

      const { slug } = args as { slug: string };
      const project = await getProjectBySlug(slug);
      if (!project) {
        return { content: [{ type: "text" as const, text: `Project "${slug}" not found in Prism.` }] };
      }

      const [lastIndexTime, activeJob, files] = await Promise.all([
        getLastCompletedIndexTime(project.id),
        hasActiveJobForProject(project.id),
        getProjectFiles(project.id),
      ]);

      const lines: string[] = [
        `## Project Status: ${slug}`,
        "",
        `- **Index status:** ${project.indexStatus}`,
        `- **Total files:** ${files.length}`,
        `- **Last indexed:** ${lastIndexTime ? lastIndexTime.toISOString() : "never"}`,
        `- **Active job:** ${activeJob ? "yes" : "no"}`,
      ];

      return { content: [{ type: "text" as const, text: lines.join("\n") }] };
    }

    throw new Error(`Unknown tool: ${toolName}`);
  });

  return server;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

mcpRouter.post("/mcp", requireApiKey, async (req, res) => {
  try {
    const permissions = req.apiKeyPermissions ?? [];
    const server = createMcpServer(permissions);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

    // Clean up after response is done
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
  } catch (err) {
    logger.error({ err }, "MCP request failed");
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP request failed" });
    }
  }
});

// GET and DELETE must return 405 for stateless servers per MCP spec
mcpRouter.get("/mcp", requireApiKey, (_req, res) => {
  res.status(405).set("Allow", "POST").json({ error: "Method not allowed. Use POST for stateless MCP." });
});

mcpRouter.delete("/mcp", requireApiKey, (_req, res) => {
  res.status(405).set("Allow", "POST").json({ error: "Method not allowed. Use POST for stateless MCP." });
});
