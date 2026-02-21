/**
 * `prism search <project> "query"` command — semantic search across a project.
 *
 * Embeds the query using the configured embedding provider, then performs
 * a pgvector cosine-similarity search to find the most relevant symbols.
 */

import { Command } from "commander";
import {
  logger,
  initConfig,
  getConfig,
  getProject,
  getProjectByPath,
  simpleSimilaritySearch,
  createEmbedder,
} from "@prism/core";
import { resolve } from "node:path";

export const searchCommand = new Command("search")
  .description("Semantic search across a project's indexed symbols")
  .argument("<project>", "Project ID (number) or path")
  .argument("<query>", "Search query in natural language")
  .option("-n, --limit <number>", "Number of results to return", "10")
  .action(
    async (
      projectArg: string,
      query: string,
      opts: { limit: string },
    ) => {
      const config = initConfig();
      const limit = parseInt(opts.limit, 10) || 10;

      // Resolve project: by ID or by path
      let project;
      const projectId = parseInt(projectArg, 10);
      if (!isNaN(projectId)) {
        project = await getProject(projectId);
      } else {
        project = await getProjectByPath(resolve(projectArg));
      }

      if (!project) {
        console.error(
          `Project not found: ${projectArg}\nRun "prism init" and "prism index" first.`,
        );
        process.exitCode = 1;
        return;
      }

      logger.info(
        { projectId: project.id, query, limit },
        "Running semantic search",
      );

      // Embed the query
      let queryVector: number[];
      try {
        const embedder = createEmbedder(config.semantic);
        const vectors = await embedder.embed([query]);
        queryVector = vectors[0];
      } catch (err) {
        console.error(
          `Failed to embed query: ${err instanceof Error ? err.message : String(err)}`,
        );
        console.error(
          "Ensure the embedding provider API key is set (VOYAGE_API_KEY or OPENAI_API_KEY).",
        );
        process.exitCode = 1;
        return;
      }

      // Run similarity search
      const results = await simpleSimilaritySearch(
        project.id,
        queryVector,
        limit,
      );

      if (results.length === 0) {
        console.log(
          "\n  No results found. Run \"prism index\" with the semantic layer first.\n",
        );
        return;
      }

      // Format and print results
      console.log(
        `\n  Search results for "${query}" in ${project.name} (top ${results.length}):\n`,
      );

      console.log(
        formatSearchResults(results),
      );
      console.log();
    },
  );

/**
 * Format search results as a text table.
 */
export function formatSearchResults(
  results: Array<{
    score: number;
    filePath: string | null;
    symbolName: string | null;
    symbolKind: string | null;
    summaryContent: string;
  }>,
): string {
  const lines: string[] = [];

  // Header
  lines.push(
    `  ${"#".padEnd(4)} ${"Score".padEnd(8)} ${"Kind".padEnd(12)} ${"Symbol".padEnd(30)} ${"File".padEnd(40)} Summary`,
  );
  lines.push("  " + "-".repeat(130));

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const rank = String(i + 1).padEnd(4);
    const score = (r.score * 100).toFixed(1).padStart(5) + "%  ";
    const kind = (r.symbolKind ?? "?").padEnd(12);
    const name = (r.symbolName ?? "?").padEnd(30);
    const file = (r.filePath ?? "?").padEnd(40);
    const summary =
      r.summaryContent.length > 60
        ? r.summaryContent.slice(0, 60) + "..."
        : r.summaryContent;

    lines.push(`  ${rank}${score}${kind}${name}${file}${summary}`);
  }

  return lines.join("\n");
}
