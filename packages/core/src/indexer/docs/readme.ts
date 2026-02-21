/**
 * README and documentation file parsing.
 *
 * Extracts structured information from README.md, CHANGELOG, LICENSE,
 * and other documentation files. Parses markdown to identify headers,
 * sections, purpose, architecture descriptions, and setup instructions.
 */

import type { FileEntry } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A section extracted from a markdown document. */
export interface DocSection {
  /** Heading text (without the `#` markers). */
  heading: string;
  /** Heading level (1-6). */
  level: number;
  /** Raw content under this heading (excluding sub-headings). */
  content: string;
  /** Line number where the section starts (1-based). */
  startLine: number;
}

/** Structured result of parsing a documentation file. */
export interface ReadmeParseResult {
  /** Project-relative path of the file. */
  filePath: string;
  /** Document title (first H1, or filename if none). */
  title: string;
  /** All sections extracted from the document. */
  sections: DocSection[];
  /** Extracted purpose / "what is this" description (if found). */
  purpose: string | null;
  /** Extracted architecture or design description (if found). */
  architecture: string | null;
  /** Extracted setup / installation instructions (if found). */
  setupInstructions: string | null;
  /** Full text content for storage as doc_content. */
  summary: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Patterns that identify documentation files. */
const DOC_FILE_PATTERNS = [
  /^readme(\.(md|rst|txt|adoc))?$/i,
  /^changelog(\.(md|rst|txt|adoc))?$/i,
  /^contributing(\.(md|rst|txt|adoc))?$/i,
  /^license(\.(md|txt))?$/i,
  /^code_of_conduct(\.(md|txt))?$/i,
  /^security(\.(md|txt))?$/i,
  /^architecture(\.(md|txt))?$/i,
  /^design(\.(md|txt))?$/i,
  /\.md$/i,
  /\.rst$/i,
  /\.adoc$/i,
];

/** Heading patterns that typically describe the project purpose. */
const PURPOSE_HEADINGS = [
  /^what\s+is/i,
  /^about$/i,
  /^overview$/i,
  /^introduction$/i,
  /^description$/i,
  /^purpose$/i,
  /^summary$/i,
];

/** Heading patterns that describe architecture or design. */
const ARCHITECTURE_HEADINGS = [
  /^architecture$/i,
  /^design$/i,
  /^structure$/i,
  /^system\s+design/i,
  /^tech(nical)?\s+stack/i,
  /^tech\s+stack/i,
  /^stack$/i,
  /^components$/i,
  /^modules$/i,
];

/** Heading patterns that describe setup or installation. */
const SETUP_HEADINGS = [
  /^install(ation)?$/i,
  /^setup$/i,
  /^getting\s+started$/i,
  /^quick\s*start$/i,
  /^usage$/i,
  /^prerequisites$/i,
  /^requirements$/i,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a file is a documentation file based on its path.
 */
export function isDocumentationFile(relativePath: string): boolean {
  const filename = relativePath.split("/").pop() ?? "";
  // Check if file is in a docs/ directory
  const inDocsDir =
    relativePath.startsWith("docs/") ||
    relativePath.startsWith("doc/") ||
    relativePath.includes("/docs/") ||
    relativePath.includes("/doc/");

  if (inDocsDir && /\.(md|rst|txt|adoc)$/i.test(filename)) {
    return true;
  }

  return DOC_FILE_PATTERNS.some((pattern) => pattern.test(filename));
}

/**
 * Parse a documentation file and extract structured information.
 */
export function parseReadme(file: FileEntry): ReadmeParseResult {
  const sections = parseMarkdownSections(file.content);

  const title = extractTitle(sections, file.path);
  const purpose = findSectionByPatterns(sections, PURPOSE_HEADINGS);
  const architecture = findSectionByPatterns(sections, ARCHITECTURE_HEADINGS);
  const setupInstructions = findSectionByPatterns(sections, SETUP_HEADINGS);

  // Build a summary combining all key information
  const summary = buildSummary(title, purpose, architecture, setupInstructions, sections);

  return {
    filePath: file.path,
    title,
    sections,
    purpose,
    architecture,
    setupInstructions,
    summary,
  };
}

/**
 * Parse documentation from a batch of FileEntry objects.
 * Only processes files identified as documentation.
 */
export function parseDocFiles(files: FileEntry[]): ReadmeParseResult[] {
  const results: ReadmeParseResult[] = [];

  for (const file of files) {
    if (isDocumentationFile(file.path)) {
      results.push(parseReadme(file));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Markdown parsing
// ---------------------------------------------------------------------------

/**
 * Parse a markdown document into sections based on headings.
 */
export function parseMarkdownSections(content: string): DocSection[] {
  const lines = content.split("\n");
  const sections: DocSection[] = [];

  let currentHeading: string | null = null;
  let currentLevel = 0;
  let currentStartLine = 1;
  let currentContent: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section if any
      if (currentHeading !== null) {
        sections.push({
          heading: currentHeading,
          level: currentLevel,
          content: currentContent.join("\n").trim(),
          startLine: currentStartLine,
        });
      }

      currentHeading = headingMatch[2].trim();
      currentLevel = headingMatch[1].length;
      currentStartLine = i + 1;
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Push last section
  if (currentHeading !== null) {
    sections.push({
      heading: currentHeading,
      level: currentLevel,
      content: currentContent.join("\n").trim(),
      startLine: currentStartLine,
    });
  }

  // If no headings found, treat entire content as a single section
  if (sections.length === 0 && content.trim().length > 0) {
    sections.push({
      heading: "",
      level: 0,
      content: content.trim(),
      startLine: 1,
    });
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract the document title from sections or fall back to the filename.
 */
function extractTitle(sections: DocSection[], filePath: string): string {
  // Look for the first H1
  const h1 = sections.find((s) => s.level === 1);
  if (h1) return h1.heading;

  // Fall back to the filename without extension
  const filename = filePath.split("/").pop() ?? filePath;
  return filename.replace(/\.[^.]+$/, "");
}

/**
 * Find the content of the first section matching any of the given patterns.
 */
function findSectionByPatterns(
  sections: DocSection[],
  patterns: RegExp[],
): string | null {
  for (const section of sections) {
    for (const pattern of patterns) {
      if (pattern.test(section.heading)) {
        return section.content || null;
      }
    }
  }
  return null;
}

/**
 * Build a human-readable summary from the extracted sections.
 */
function buildSummary(
  title: string,
  purpose: string | null,
  architecture: string | null,
  setupInstructions: string | null,
  sections: DocSection[],
): string {
  const parts: string[] = [];

  parts.push(`# ${title}`);

  if (purpose) {
    parts.push(`\n## Purpose\n${purpose}`);
  }

  if (architecture) {
    parts.push(`\n## Architecture\n${architecture}`);
  }

  if (setupInstructions) {
    parts.push(`\n## Setup\n${setupInstructions}`);
  }

  // If no specific sections were found, include the first section's content
  if (!purpose && !architecture && !setupInstructions && sections.length > 0) {
    const firstContent = sections[0].content;
    if (firstContent) {
      parts.push(`\n${firstContent}`);
    }
  }

  return parts.join("\n").trim();
}
