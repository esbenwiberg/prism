/**
 * Language detection and grammar registry.
 *
 * Maps file extensions to tree-sitter grammar names and provides the path
 * to each grammar's `.wasm` file from the `tree-sitter-wasms` package.
 */

import { resolve } from "node:path";
import type { SupportedLanguage } from "../types.js";

// ---------------------------------------------------------------------------
// Extension → language mapping
// ---------------------------------------------------------------------------

const EXTENSION_MAP: Record<string, SupportedLanguage> = {
  ".ts": "typescript",
  ".tsx": "tsx",
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".py": "python",
  ".cs": "c_sharp",
};

// ---------------------------------------------------------------------------
// Language → grammar .wasm file name
// ---------------------------------------------------------------------------

const GRAMMAR_FILE_MAP: Record<SupportedLanguage, string> = {
  typescript: "tree-sitter-typescript.wasm",
  tsx: "tree-sitter-tsx.wasm",
  javascript: "tree-sitter-javascript.wasm",
  python: "tree-sitter-python.wasm",
  c_sharp: "tree-sitter-c_sharp.wasm",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detect the language of a file from its extension.
 * Returns `null` if the language is not supported.
 */
export function detectLanguage(filePath: string): SupportedLanguage | null {
  const ext = getExtension(filePath);
  return EXTENSION_MAP[ext] ?? null;
}

/**
 * Get the set of supported file extensions.
 */
export function getSupportedExtensions(): ReadonlySet<string> {
  return new Set(Object.keys(EXTENSION_MAP));
}

/**
 * Check whether a given language string is a supported language.
 */
export function isSupportedLanguage(lang: string): lang is SupportedLanguage {
  return lang in GRAMMAR_FILE_MAP;
}

/**
 * Resolve the absolute path to a grammar `.wasm` file for the given language.
 *
 * Uses `createRequire` to locate the `tree-sitter-wasms` package reliably
 * regardless of the working directory.
 */
export function getGrammarPath(language: SupportedLanguage): string {
  // In Node16/CJS mode, require.resolve is available directly
  const wasmPkgDir = resolve(
    require.resolve("tree-sitter-wasms/package.json"),
    "..",
  );
  return resolve(wasmPkgDir, "out", GRAMMAR_FILE_MAP[language]);
}

/**
 * Get all supported languages.
 */
export function getSupportedLanguages(): readonly SupportedLanguage[] {
  return Object.keys(GRAMMAR_FILE_MAP) as SupportedLanguage[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the file extension (including the dot), lowercased. */
function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1) return "";
  return filePath.slice(lastDot).toLowerCase();
}
