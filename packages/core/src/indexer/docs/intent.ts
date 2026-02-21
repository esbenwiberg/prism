/**
 * Intent layer assembly.
 *
 * Combines information from README parsing, config file analysis, and
 * inline comments to build a coherent "intent" description of what the
 * codebase (or a module within it) is supposed to do.
 *
 * The intent is a structured summary that later layers (semantic, analysis,
 * blueprint) use as context for LLM-powered analysis.
 */

import type { ReadmeParseResult } from "./readme.js";
import type { FileCommentsResult } from "./comments.js";
import type { ConfigInfo, TechStackInfo } from "./config.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The assembled intent for a project. */
export interface ProjectIntent {
  /** One-sentence project description. */
  description: string;
  /** Detected purpose / "what does this do". */
  purpose: string | null;
  /** Architecture overview (from README or inferred). */
  architecture: string | null;
  /** Tech stack summary. */
  techStack: TechStackSummary;
  /** Key modules / packages detected. */
  modules: ModuleIntent[];
  /** Full assembled text for storage. */
  fullText: string;
}

/** Simplified tech stack for the intent. */
export interface TechStackSummary {
  languages: string[];
  frameworks: string[];
  buildTools: string[];
  testFrameworks: string[];
}

/** Intent for a single module or sub-package. */
export interface ModuleIntent {
  /** Module name or directory path. */
  name: string;
  /** Description from README or package.json. */
  description: string | null;
  /** File-level comment summaries. */
  fileDescriptions: Array<{ path: string; description: string }>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Assemble the project intent from all documentation layer outputs.
 */
export function assembleIntent(
  readmeResults: ReadmeParseResult[],
  configInfos: ConfigInfo[],
  commentResults: FileCommentsResult[],
  techStack: TechStackInfo,
): ProjectIntent {
  // 1. Extract project description from the primary README
  const primaryReadme = findPrimaryReadme(readmeResults);
  const description = extractDescription(primaryReadme, configInfos);
  const purpose = primaryReadme?.purpose ?? null;
  const architecture = primaryReadme?.architecture ?? null;

  // 2. Build tech stack summary
  const techStackSummary: TechStackSummary = {
    languages: techStack.languages,
    frameworks: techStack.frameworks,
    buildTools: techStack.buildTools,
    testFrameworks: techStack.testFrameworks,
  };

  // 3. Identify modules from directory structure and package.json files
  const modules = identifyModules(readmeResults, configInfos, commentResults);

  // 4. Assemble the full text
  const fullText = buildFullText(
    description,
    purpose,
    architecture,
    techStackSummary,
    modules,
    configInfos,
  );

  return {
    description,
    purpose,
    architecture,
    techStack: techStackSummary,
    modules,
    fullText,
  };
}

/**
 * Build a doc_content string for the project's intent.
 * This is what gets stored in the database as a summary.
 */
export function buildIntentDocContent(intent: ProjectIntent): string {
  return intent.fullText;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find the primary README (root-level README.md preferred).
 */
function findPrimaryReadme(
  results: ReadmeParseResult[],
): ReadmeParseResult | null {
  // Prefer root-level README.md
  const rootReadme = results.find(
    (r) =>
      r.filePath.toLowerCase() === "readme.md" ||
      r.filePath.toLowerCase() === "readme",
  );
  if (rootReadme) return rootReadme;

  // Fall back to the first README found
  const anyReadme = results.find((r) =>
    r.filePath.toLowerCase().includes("readme"),
  );
  return anyReadme ?? null;
}

/**
 * Extract a one-line project description.
 */
function extractDescription(
  readme: ReadmeParseResult | null,
  configs: ConfigInfo[],
): string {
  // Try package.json description first
  for (const config of configs) {
    if (
      config.category === "package-manager" &&
      config.details.description
    ) {
      return config.details.description;
    }
  }

  // Try README purpose
  if (readme?.purpose) {
    // Take the first sentence
    const firstSentence = readme.purpose.split(/\.\s/)[0];
    if (firstSentence && firstSentence.length <= 200) {
      return firstSentence.endsWith(".") ? firstSentence : firstSentence + ".";
    }
  }

  // Try README title
  if (readme?.title) {
    return readme.title;
  }

  return "No project description found.";
}

/**
 * Identify modules / sub-packages in the project.
 */
function identifyModules(
  readmes: ReadmeParseResult[],
  configs: ConfigInfo[],
  comments: FileCommentsResult[],
): ModuleIntent[] {
  const moduleMap = new Map<string, ModuleIntent>();

  // Identify modules from package.json files in subdirectories
  for (const config of configs) {
    if (
      config.category === "package-manager" &&
      config.filePath.includes("/") &&
      config.filePath.endsWith("package.json")
    ) {
      const dir = config.filePath.replace(/\/package\.json$/, "");
      const name = config.details.name ?? dir;

      if (!moduleMap.has(dir)) {
        moduleMap.set(dir, {
          name,
          description: config.details.description ?? null,
          fileDescriptions: [],
        });
      }
    }
  }

  // Enrich modules with README information
  for (const readme of readmes) {
    if (readme.filePath.includes("/")) {
      const dir = readme.filePath.replace(/\/[^/]+$/, "");
      const existing = moduleMap.get(dir);
      if (existing && !existing.description && readme.purpose) {
        existing.description = readme.purpose.substring(0, 200);
      }
    }
  }

  // Add file header descriptions from comments
  for (const commentResult of comments) {
    if (!commentResult.fileHeader) continue;

    // Find the module this file belongs to
    for (const [dir, mod] of moduleMap) {
      if (commentResult.filePath.startsWith(dir + "/")) {
        mod.fileDescriptions.push({
          path: commentResult.filePath,
          description: commentResult.fileHeader.substring(0, 150),
        });
        break;
      }
    }
  }

  return [...moduleMap.values()];
}

/**
 * Build the full text representation of the project intent.
 */
function buildFullText(
  description: string,
  purpose: string | null,
  architecture: string | null,
  techStack: TechStackSummary,
  modules: ModuleIntent[],
  configs: ConfigInfo[],
): string {
  const parts: string[] = [];

  // Project description
  parts.push(`# Project Intent\n`);
  parts.push(`## Description\n${description}\n`);

  // Purpose
  if (purpose) {
    parts.push(`## Purpose\n${purpose}\n`);
  }

  // Architecture
  if (architecture) {
    parts.push(`## Architecture\n${architecture}\n`);
  }

  // Tech stack
  const stackParts: string[] = [];
  if (techStack.languages.length > 0) {
    stackParts.push(`Languages: ${techStack.languages.join(", ")}`);
  }
  if (techStack.frameworks.length > 0) {
    stackParts.push(`Frameworks: ${techStack.frameworks.join(", ")}`);
  }
  if (techStack.buildTools.length > 0) {
    stackParts.push(`Build tools: ${techStack.buildTools.join(", ")}`);
  }
  if (techStack.testFrameworks.length > 0) {
    stackParts.push(`Test frameworks: ${techStack.testFrameworks.join(", ")}`);
  }
  if (stackParts.length > 0) {
    parts.push(`## Tech Stack\n${stackParts.join("\n")}\n`);
  }

  // Modules
  if (modules.length > 0) {
    parts.push("## Modules\n");
    for (const mod of modules) {
      parts.push(`### ${mod.name}`);
      if (mod.description) {
        parts.push(mod.description);
      }
      if (mod.fileDescriptions.length > 0) {
        parts.push("Key files:");
        for (const fd of mod.fileDescriptions.slice(0, 10)) {
          parts.push(`- ${fd.path}: ${fd.description}`);
        }
      }
      parts.push("");
    }
  }

  // Config summary
  const meaningfulConfigs = configs.filter(
    (c) => c.category !== "git" && c.category !== "editor",
  );
  if (meaningfulConfigs.length > 0) {
    parts.push("## Configuration\n");
    for (const config of meaningfulConfigs) {
      parts.push(`- ${config.filePath}: ${config.purpose}`);
    }
    parts.push("");
  }

  return parts.join("\n").trim();
}
