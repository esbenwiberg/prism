/**
 * Inline comment and docstring extraction from source files.
 *
 * Extracts all comments from source code files, categorised by type:
 * - File-level header comments (module docstrings)
 * - Inline comments (single-line)
 * - Block comments (multi-line)
 * - JSDoc / XML-doc / docstrings
 *
 * Works on raw file content (no tree-sitter required), so it can
 * process any file that Layer 1 already walked.
 */

import type { FileEntry } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The category of a comment. */
export type CommentKind = "file-header" | "jsdoc" | "block" | "line" | "docstring" | "xml-doc";

/** A single comment extracted from a source file. */
export interface ExtractedComment {
  /** Category of the comment. */
  kind: CommentKind;
  /** Raw comment text (with markers stripped). */
  text: string;
  /** 1-based start line. */
  startLine: number;
  /** 1-based end line. */
  endLine: number;
}

/** Result of extracting comments from a single file. */
export interface FileCommentsResult {
  /** Project-relative file path. */
  filePath: string;
  /** The file-level header comment / module docstring (if any). */
  fileHeader: string | null;
  /** All comments found in the file. */
  comments: ExtractedComment[];
  /** Aggregated doc content string for storage. */
  docContent: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract comments from a source file based on its detected language.
 */
export function extractComments(file: FileEntry): FileCommentsResult {
  const language = file.language;

  let comments: ExtractedComment[];

  if (language === "python") {
    comments = extractPythonComments(file.content);
  } else if (language === "c_sharp") {
    comments = extractCSharpComments(file.content);
  } else if (
    language === "typescript" ||
    language === "tsx" ||
    language === "javascript"
  ) {
    comments = extractJSComments(file.content);
  } else {
    // For unknown languages, try a generic approach
    comments = extractGenericComments(file.content);
  }

  // Identify file header
  const fileHeader = identifyFileHeader(comments);

  // Build aggregated doc content
  const docContent = buildDocContent(fileHeader, comments);

  return {
    filePath: file.path,
    fileHeader,
    comments,
    docContent,
  };
}

/**
 * Extract comments from a batch of source files (non-doc, non-config files).
 */
export function extractCommentsFromFiles(
  files: FileEntry[],
): FileCommentsResult[] {
  const results: FileCommentsResult[] = [];

  for (const file of files) {
    // Only process files that have a detected language (source files)
    if (file.language) {
      results.push(extractComments(file));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// JavaScript / TypeScript comment extraction
// ---------------------------------------------------------------------------

/**
 * Extract comments from JavaScript/TypeScript source code.
 */
export function extractJSComments(content: string): ExtractedComment[] {
  const comments: ExtractedComment[] = [];
  const lines = content.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // JSDoc comment: /** ... */
    if (trimmed.startsWith("/**")) {
      const result = extractMultiLineComment(lines, i, "/**", "*/");
      if (result) {
        const text = stripJSDocMarkers(result.text);
        comments.push({
          kind: "jsdoc",
          text,
          startLine: i + 1,
          endLine: result.endIndex + 1,
        });
        i = result.endIndex + 1;
        continue;
      }
    }

    // Block comment: /* ... */
    if (trimmed.startsWith("/*")) {
      const result = extractMultiLineComment(lines, i, "/*", "*/");
      if (result) {
        const text = stripBlockCommentMarkers(result.text);
        comments.push({
          kind: "block",
          text,
          startLine: i + 1,
          endLine: result.endIndex + 1,
        });
        i = result.endIndex + 1;
        continue;
      }
    }

    // Single-line comment: // ...
    if (trimmed.startsWith("//")) {
      const text = trimmed.replace(/^\/\/\s?/, "");
      comments.push({
        kind: "line",
        text,
        startLine: i + 1,
        endLine: i + 1,
      });
    }

    i++;
  }

  return comments;
}

// ---------------------------------------------------------------------------
// Python comment extraction
// ---------------------------------------------------------------------------

/**
 * Extract comments from Python source code.
 */
export function extractPythonComments(content: string): ExtractedComment[] {
  const comments: ExtractedComment[] = [];
  const lines = content.split("\n");

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // Triple-quoted strings (docstrings): """ ... """ or ''' ... '''
    if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
      const quote = trimmed.substring(0, 3);
      const result = extractTripleQuoteString(lines, i, quote);
      if (result) {
        comments.push({
          kind: "docstring",
          text: result.text,
          startLine: i + 1,
          endLine: result.endIndex + 1,
        });
        i = result.endIndex + 1;
        continue;
      }
    }

    // Hash comments: # ...
    if (trimmed.startsWith("#")) {
      const text = trimmed.replace(/^#\s?/, "");
      comments.push({
        kind: "line",
        text,
        startLine: i + 1,
        endLine: i + 1,
      });
    }

    i++;
  }

  return comments;
}

// ---------------------------------------------------------------------------
// C# comment extraction
// ---------------------------------------------------------------------------

/**
 * Extract comments from C# source code.
 */
export function extractCSharpComments(content: string): ExtractedComment[] {
  const comments: ExtractedComment[] = [];
  const lines = content.split("\n");

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // XML doc comments: /// ...
    if (trimmed.startsWith("///")) {
      // Collect consecutive /// lines
      const startLine = i;
      const xmlLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith("///")) {
        xmlLines.push(lines[i].trim().replace(/^\/\/\/\s?/, ""));
        i++;
      }
      comments.push({
        kind: "xml-doc",
        text: xmlLines.join("\n"),
        startLine: startLine + 1,
        endLine: i,
      });
      continue;
    }

    // Block comment: /* ... */
    if (trimmed.startsWith("/*")) {
      const result = extractMultiLineComment(lines, i, "/*", "*/");
      if (result) {
        const text = stripBlockCommentMarkers(result.text);
        comments.push({
          kind: "block",
          text,
          startLine: i + 1,
          endLine: result.endIndex + 1,
        });
        i = result.endIndex + 1;
        continue;
      }
    }

    // Single-line comment: // ...
    if (trimmed.startsWith("//")) {
      const text = trimmed.replace(/^\/\/\s?/, "");
      comments.push({
        kind: "line",
        text,
        startLine: i + 1,
        endLine: i + 1,
      });
    }

    i++;
  }

  return comments;
}

// ---------------------------------------------------------------------------
// Generic comment extraction (fallback)
// ---------------------------------------------------------------------------

/**
 * Generic comment extraction for files without a known language.
 * Handles `//` and `#` style single-line comments and block comments.
 */
function extractGenericComments(content: string): ExtractedComment[] {
  const comments: ExtractedComment[] = [];
  const lines = content.split("\n");

  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed.startsWith("/*")) {
      const result = extractMultiLineComment(lines, i, "/*", "*/");
      if (result) {
        comments.push({
          kind: "block",
          text: stripBlockCommentMarkers(result.text),
          startLine: i + 1,
          endLine: result.endIndex + 1,
        });
        i = result.endIndex + 1;
        continue;
      }
    }

    if (trimmed.startsWith("//")) {
      comments.push({
        kind: "line",
        text: trimmed.replace(/^\/\/\s?/, ""),
        startLine: i + 1,
        endLine: i + 1,
      });
    } else if (trimmed.startsWith("#")) {
      comments.push({
        kind: "line",
        text: trimmed.replace(/^#\s?/, ""),
        startLine: i + 1,
        endLine: i + 1,
      });
    }

    i++;
  }

  return comments;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface MultiLineResult {
  text: string;
  endIndex: number;
}

/**
 * Extract a multi-line comment starting at the given line index.
 */
function extractMultiLineComment(
  lines: string[],
  startIndex: number,
  openMarker: string,
  closeMarker: string,
): MultiLineResult | null {
  const collected: string[] = [];
  let i = startIndex;

  // Check for single-line case: /** something */
  const firstLine = lines[i].trim();
  if (firstLine.includes(closeMarker) && firstLine.indexOf(closeMarker) > firstLine.indexOf(openMarker)) {
    return { text: firstLine, endIndex: i };
  }

  collected.push(lines[i]);
  i++;

  while (i < lines.length) {
    collected.push(lines[i]);
    if (lines[i].includes(closeMarker)) {
      return { text: collected.join("\n"), endIndex: i };
    }
    i++;
  }

  // Unclosed comment — return what we have
  return { text: collected.join("\n"), endIndex: i - 1 };
}

/**
 * Extract a triple-quoted string (Python docstring).
 */
function extractTripleQuoteString(
  lines: string[],
  startIndex: number,
  quote: string,
): MultiLineResult | null {
  const firstLine = lines[startIndex].trim();

  // Single-line docstring: """something"""
  const afterOpen = firstLine.substring(quote.length);
  const closePos = afterOpen.indexOf(quote);
  if (closePos >= 0) {
    return {
      text: afterOpen.substring(0, closePos).trim(),
      endIndex: startIndex,
    };
  }

  // Multi-line
  const collected: string[] = [afterOpen];
  let i = startIndex + 1;

  while (i < lines.length) {
    const line = lines[i];
    const quotePos = line.indexOf(quote);
    if (quotePos >= 0) {
      collected.push(line.substring(0, quotePos));
      return {
        text: collected.join("\n").trim(),
        endIndex: i,
      };
    }
    collected.push(line);
    i++;
  }

  // Unclosed
  return { text: collected.join("\n").trim(), endIndex: i - 1 };
}

/**
 * Strip JSDoc markers from a comment block.
 */
function stripJSDocMarkers(text: string): string {
  return text
    .replace(/^\/\*\*\s*/, "")
    .replace(/\s*\*\/$/, "")
    .replace(/^\s*\*\s?/gm, "")
    .trim();
}

/**
 * Strip block comment markers from a /* ... * / comment.
 */
function stripBlockCommentMarkers(text: string): string {
  return text
    .replace(/^\/\*\s*/, "")
    .replace(/\s*\*\/$/, "")
    .replace(/^\s*\*\s?/gm, "")
    .trim();
}

/**
 * Identify the file-level header comment (first comment in the file,
 * typically a module docstring or license header).
 */
function identifyFileHeader(comments: ExtractedComment[]): string | null {
  if (comments.length === 0) return null;

  const first = comments[0];
  // Only consider comments starting at the very top of the file (lines 1-3)
  if (first.startLine > 3) return null;

  if (
    first.kind === "jsdoc" ||
    first.kind === "block" ||
    first.kind === "docstring" ||
    first.kind === "xml-doc"
  ) {
    return first.text;
  }

  // Consecutive line comments at the top
  if (first.kind === "line" && first.startLine <= 2) {
    const headerLines: string[] = [first.text];
    for (let i = 1; i < comments.length; i++) {
      const c = comments[i];
      if (c.kind !== "line") break;
      if (c.startLine !== comments[i - 1].endLine + 1) break;
      headerLines.push(c.text);
    }
    if (headerLines.length > 0) {
      return headerLines.join("\n");
    }
  }

  return null;
}

/**
 * Build aggregated doc content from file header and all comments.
 */
function buildDocContent(
  fileHeader: string | null,
  comments: ExtractedComment[],
): string {
  const parts: string[] = [];

  if (fileHeader) {
    parts.push(`File description: ${fileHeader}`);
  }

  // Collect JSDoc/docstring comments as they describe API surface
  const docComments = comments.filter(
    (c) => c.kind === "jsdoc" || c.kind === "docstring" || c.kind === "xml-doc",
  );

  if (docComments.length > 0) {
    parts.push(
      `Documentation comments (${docComments.length}):`,
    );
    for (const dc of docComments) {
      parts.push(`- [L${dc.startLine}] ${dc.text.substring(0, 200)}`);
    }
  }

  return parts.join("\n").trim();
}
