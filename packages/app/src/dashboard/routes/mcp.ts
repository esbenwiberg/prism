/**
 * MCP (Model Context Protocol) route handler.
 *
 * Exposes a `search_codebase` tool via StreamableHTTP transport so Claude Code
 * can connect as a remote MCP server. Direct DB access — no HTTP roundtrip.
 *
 * Route: POST /mcp?project=owner/repo  (+ GET, DELETE for protocol compliance)
 * Auth:  Bearer token via requireApiKey
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
  getFindingsByProjectId,
  logger,
} from "@prism/core";
import { requireApiKey } from "../../auth/api-key.js";

export const mcpRouter = Router();

// ---------------------------------------------------------------------------
// Helpers (ported from packages/mcp)
// ---------------------------------------------------------------------------

function severityEmoji(severity?: string): string {
  switch (severity?.toLowerCase()) {
    case "critical": return "🔴";
    case "high": return "⚠";
    case "medium": return "🟡";
    case "low": return "🔵";
    default: return "ℹ";
  }
}

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
  findings: Array<{
    category: string;
    severity: string;
    title: string;
    description: string | null;
    suggestion: string | null;
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

  // Findings
  const findings = data.findings;
  if (findings.length > 0) {
    lines.push("### Findings");
    for (const f of findings) {
      const sev = `${f.severity.toUpperCase()}: `;
      lines.push(`${severityEmoji(f.severity)} ${sev}${f.title}`);
      if (f.description) lines.push(f.description);
      if (f.suggestion) lines.push(`_Fix:_ ${f.suggestion}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Per-request MCP server factory
// ---------------------------------------------------------------------------

function createMcpServer(slug: string): Server {
  const server = new Server(
    { name: "prism", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "search_codebase",
        description:
          "Search the Prism-indexed codebase for relevant code, module summaries, and findings. " +
          "Pass the current working directory so Prism can identify which project to query.",
        inputSchema: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description: "Natural language question about the codebase",
            },
            cwd: {
              type: "string",
              description:
                "Current working directory. Used to locate prism.yaml and identify the project.",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of code results to return (default: 15)",
            },
          },
          required: ["query", "cwd"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== "search_codebase") {
      throw new Error(`Unknown tool: ${request.params.name}`);
    }

    const { query, maxResults = 15 } = request.params.arguments as {
      query: string;
      cwd: string;
      maxResults?: number;
    };

    // Look up the project from the slug in the URL (not from cwd/filesystem)
    const project = await getProjectBySlug(slug);
    if (!project) {
      return {
        content: [{ type: "text", text: `Project "${slug}" not found in Prism.` }],
      };
    }

    if (project.indexStatus !== "completed" && project.indexStatus !== "partial") {
      return {
        content: [{ type: "text", text: `Project "${slug}" is not yet indexed.` }],
      };
    }

    try {
      const config = getConfig();
      const embedder = createEmbedder(config.semantic);
      const [queryVector] = await embedder.embed([query]);

      const maxSummaries = 30;
      const maxFindings = 20;
      const searchLimit = maxResults + maxSummaries;
      const allResults = await similaritySearch(project.id, queryVector, searchLimit);

      const relevantCode = allResults
        .filter((r) => r.level !== "module" && r.level !== "system")
        .slice(0, maxResults);

      const moduleSummaries = allResults
        .filter((r) => r.level === "module")
        .slice(0, maxSummaries);

      const allFindings = await getFindingsByProjectId(project.id);
      const findings = allFindings
        .filter((f) => ["critical", "high", "medium"].includes(f.severity))
        .slice(0, maxFindings);

      const text = formatResponse(query, slug, { relevantCode, moduleSummaries, findings });
      return { content: [{ type: "text", text }] };
    } catch (err) {
      logger.error({ slug, error: err instanceof Error ? err.message : String(err) }, "MCP search failed");
      return { content: [{ type: "text", text: `Search failed: ${err instanceof Error ? err.message : String(err)}` }] };
    }
  });

  return server;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

mcpRouter.post("/mcp", requireApiKey, async (req, res) => {
  const slug = req.query.project as string | undefined;
  if (!slug) {
    res.status(400).json({ error: "Missing ?project=owner/repo query parameter" });
    return;
  }

  try {
    const server = createMcpServer(slug);
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
