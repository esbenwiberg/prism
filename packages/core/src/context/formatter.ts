/**
 * Renders assembled context sections as markdown.
 */

import type { ContextResponse } from "./types.js";

/**
 * Format a context response as markdown.
 */
export function formatContextAsMarkdown(response: ContextResponse): string {
  const lines: string[] = [];

  for (const section of response.sections) {
    lines.push(`## ${section.heading}`, "");
    lines.push(section.content);
    lines.push("");
  }

  if (response.truncated) {
    lines.push(
      "---",
      `*Context truncated to ~${response.totalTokens} tokens. Increase maxTokens for more detail.*`,
    );
  }

  return lines.join("\n");
}
