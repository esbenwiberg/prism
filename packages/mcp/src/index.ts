/**
 * Prism MCP Server
 *
 * Exposes a `search_codebase` tool that Claude Code can call during conversations.
 * The tool walks up from `cwd` to find `prism.yaml`, reads the project slug,
 * and queries the Prism search API.
 *
 * Transport: stdio (Claude Code spawns this as a subprocess)
 *
 * Required env:
 *   PRISM_API_KEY — Bearer token for the Prism API
 * Optional env:
 *   PRISM_URL — defaults to http://localhost:3100
 */

import { existsSync, readFileSync } from "node:fs";
import { join, parse } from "node:path";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import yaml from "js-yaml";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PRISM_URL = process.env["PRISM_URL"] ?? "http://localhost:3100";
const PRISM_API_KEY = process.env["PRISM_API_KEY"];

if (!PRISM_API_KEY) {
  console.error("Error: PRISM_API_KEY environment variable is required");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PrismYaml {
  slug?: string;
}

/**
 * Walk up the directory tree from `startDir` looking for `prism.yaml`.
 * Returns the slug string if found, otherwise undefined.
 */
function findSlug(startDir: string): string | undefined {
  let dir = startDir;
  while (true) {
    const candidate = join(dir, "prism.yaml");
    if (existsSync(candidate)) {
      try {
        const parsed = yaml.load(readFileSync(candidate, "utf-8")) as PrismYaml;
        return parsed?.slug;
      } catch {
        return undefined;
      }
    }
    const parent = parse(dir).dir;
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
  return undefined;
}

interface SearchResult {
  relevantCode?: Array<{
    filePath?: string;
    name?: string;
    kind?: string;
    score?: number;
    documentation?: string;
    body?: string;
  }>;
  moduleSummaries?: Array<{
    modulePath?: string;
    summary?: string;
  }>;
  findings?: Array<{
    severity?: string;
    title?: string;
    description?: string;
    location?: string;
    suggestion?: string;
  }>;
}

/**
 * Format the Prism search API response as readable markdown.
 */
function formatResponse(query: string, slug: string, data: SearchResult): string {
  const lines: string[] = [];
  lines.push(`## Prism search: "${query}" (${slug})`, "");

  // Relevant code
  const code = data.relevantCode ?? [];
  lines.push(`### Relevant Code (${code.length} results)`);
  if (code.length === 0) {
    lines.push("No relevant code found.");
  } else {
    for (const item of code) {
      const scoreStr = item.score != null ? ` [score: ${item.score.toFixed(2)}]` : "";
      const kindStr = item.kind ? ` (${item.kind})` : "";
      lines.push(`**${item.filePath ?? "unknown"}** — \`${item.name ?? "?"}\`${kindStr}${scoreStr}`);
      const doc = item.documentation ?? item.body ?? "";
      if (doc) {
        const truncated = doc.length > 200 ? doc.slice(0, 200) + "…" : doc;
        lines.push(truncated);
      }
      lines.push("");
    }
  }

  // Module summaries
  const summaries = data.moduleSummaries ?? [];
  if (summaries.length > 0) {
    lines.push("### Module Summaries");
    for (const mod of summaries) {
      lines.push(`**${mod.modulePath ?? "unknown"}** — ${mod.summary ?? ""}`);
    }
    lines.push("");
  }

  // Findings
  const findings = data.findings ?? [];
  if (findings.length > 0) {
    lines.push("### Findings");
    for (const f of findings) {
      const sev = f.severity ? `${f.severity.toUpperCase()}: ` : "";
      lines.push(`${severityEmoji(f.severity)} ${sev}${f.title ?? ""}`);
      if (f.description) lines.push(f.description);
      if (f.location) lines.push(`_Location:_ ${f.location}`);
      if (f.suggestion) lines.push(`_Fix:_ ${f.suggestion}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function severityEmoji(severity?: string): string {
  switch (severity?.toLowerCase()) {
    case "critical": return "🔴";
    case "high": return "⚠";
    case "medium": return "🟡";
    case "low": return "🔵";
    default: return "ℹ";
  }
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

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
        type: "object",
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

  const { query, cwd, maxResults = 15 } = request.params.arguments as {
    query: string;
    cwd: string;
    maxResults?: number;
  };

  // 1. Find prism.yaml
  const slug = findSlug(cwd);
  if (!slug) {
    return {
      content: [
        {
          type: "text",
          text: "No prism.yaml found in directory tree. Run `prism init` in this repo to register it.",
        },
      ],
    };
  }

  // 2. Query Prism search API
  const url = `${PRISM_URL}/api/projects/${encodeURIComponent(slug)}/search`;
  let data: SearchResult;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PRISM_API_KEY}`,
      },
      body: JSON.stringify({ query, maxResults }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        content: [
          {
            type: "text",
            text: `Prism API error ${response.status}: ${text}`,
          },
        ],
      };
    }

    data = (await response.json()) as SearchResult;
  } catch (err) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to reach Prism at ${PRISM_URL}: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }

  // 3. Format and return
  return {
    content: [
      {
        type: "text",
        text: formatResponse(query, slug, data),
      },
    ],
  };
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
