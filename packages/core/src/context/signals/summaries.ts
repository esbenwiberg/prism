/**
 * Summary signal collector.
 *
 * Fetches summaries at the right granularity for the requested scope.
 */

import {
  getSummaryByTargetId,
  getSummariesByLevel,
  type SummaryRow,
} from "../../db/queries/summaries.js";
import type { SignalResult } from "../types.js";

/**
 * Fetch file-level and module-level summaries for a given file path.
 */
export async function collectFileSummaries(
  projectId: number,
  filePath: string,
): Promise<SignalResult> {
  const fileTargetId = `file:${filePath}`;
  const modulePath = getModulePath(filePath);
  const moduleTargetId = modulePath ? `module:${modulePath}` : null;

  const [fileSummary, moduleSummary] = await Promise.all([
    getSummaryByTargetId(projectId, fileTargetId),
    moduleTargetId ? getSummaryByTargetId(projectId, moduleTargetId) : null,
  ]);

  const items = [];

  if (fileSummary) {
    items.push({
      content: `**File Summary**\n${fileSummary.content}`,
      relevance: 1.0,
    });
  }

  if (moduleSummary) {
    items.push({
      content: `**Module Context** (${modulePath})\n${moduleSummary.content}`,
      relevance: 0.9,
    });
  }

  return {
    heading: "File & Module Context",
    priority: 1,
    items,
  };
}

/**
 * Fetch module-level summary and system-level context.
 */
export async function collectModuleSummaries(
  projectId: number,
  modulePath: string,
): Promise<SignalResult> {
  const moduleTargetId = `module:${modulePath}`;

  const [moduleSummary, systemSummaries] = await Promise.all([
    getSummaryByTargetId(projectId, moduleTargetId),
    getSummariesByLevel(projectId, "system"),
  ]);

  const items = [];

  if (moduleSummary) {
    items.push({
      content: `**Module Summary**\n${moduleSummary.content}`,
      relevance: 1.0,
    });
  }

  const systemSummary = systemSummaries[0];
  if (systemSummary) {
    items.push({
      content: `**System Context**\n${systemSummary.content}`,
      relevance: 0.8,
    });
  }

  return {
    heading: "Module & System Context",
    priority: 1,
    items,
  };
}

/**
 * Fetch architecture-level summaries (purpose + system + all modules).
 */
export async function collectArchitectureSummaries(
  projectId: number,
): Promise<{ purpose: SignalResult; system: SignalResult; modules: SignalResult }> {
  const [systemSummaries, moduleSummaries] = await Promise.all([
    getSummariesByLevel(projectId, "system"),
    getSummariesByLevel(projectId, "module"),
  ]);

  // Find purpose document (stored as system-level with targetId containing "purpose")
  const purposeSummary = systemSummaries.find((s) =>
    s.targetId.toLowerCase().includes("purpose"),
  );
  const systemSummary = systemSummaries.find(
    (s) => !s.targetId.toLowerCase().includes("purpose"),
  );

  return {
    purpose: {
      heading: "Purpose",
      priority: 1,
      items: purposeSummary
        ? [{ content: purposeSummary.content, relevance: 1.0 }]
        : [],
    },
    system: {
      heading: "System Architecture",
      priority: 1,
      items: systemSummary
        ? [{ content: systemSummary.content, relevance: 1.0 }]
        : [],
    },
    modules: {
      heading: "Module Map",
      priority: 2,
      items: moduleSummaries.map((m) => ({
        content: `**${m.targetId.replace("module:", "")}**\n${truncateSummary(m.content, 200)}`,
        relevance: 0.7,
      })),
    },
  };
}

/**
 * Fetch one-line summaries for a list of file paths.
 */
export async function collectFileSummariesBatch(
  projectId: number,
  filePaths: string[],
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  // Fetch in parallel batches
  const promises = filePaths.map(async (path) => {
    const summary = await getSummaryByTargetId(projectId, `file:${path}`);
    if (summary) {
      results.set(path, truncateSummary(summary.content, 150));
    }
  });
  await Promise.all(promises);
  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getModulePath(filePath: string): string | null {
  const parts = filePath.split("/");
  // Find the deepest directory that could be a module
  // Typically: src/module/file.ts → src/module
  if (parts.length >= 2) {
    return parts.slice(0, -1).join("/");
  }
  return null;
}

function truncateSummary(content: string, maxLen: number): string {
  if (content.length <= maxLen) return content;
  // Try to break at a sentence boundary
  const truncated = content.slice(0, maxLen);
  const lastPeriod = truncated.lastIndexOf(".");
  if (lastPeriod > maxLen * 0.5) {
    return truncated.slice(0, lastPeriod + 1);
  }
  return truncated + "...";
}
