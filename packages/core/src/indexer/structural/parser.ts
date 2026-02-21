/**
 * Tree-sitter parser initialisation and grammar loading.
 *
 * Provides a cached parser per language. Initialises web-tree-sitter once
 * (loading the WASM runtime), then lazily loads language grammars on demand.
 */

import Parser from "web-tree-sitter";
import { logger } from "../../logger.js";
import { getGrammarPath } from "./languages.js";
import type { SupportedLanguage } from "../types.js";

// Re-export tree-sitter types that other modules need
export type TreeSitterParser = Parser;
export type TreeSitterTree = Parser.Tree;
export type TreeSitterNode = Parser.SyntaxNode;

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let _initialised = false;
const _languageCache = new Map<SupportedLanguage, Parser.Language>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Ensure web-tree-sitter WASM runtime is initialised.
 *
 * Safe to call multiple times; only the first call does work.
 */
export async function initTreeSitter(): Promise<void> {
  if (_initialised) return;

  await Parser.init();
  _initialised = true;
  logger.debug("web-tree-sitter WASM runtime initialised");
}

/**
 * Load (or return cached) a tree-sitter Language for the given language.
 *
 * Automatically calls `initTreeSitter()` if not already done.
 */
export async function loadLanguage(
  language: SupportedLanguage,
): Promise<Parser.Language> {
  const cached = _languageCache.get(language);
  if (cached) return cached;

  await initTreeSitter();

  const grammarPath = getGrammarPath(language);
  const lang = await Parser.Language.load(grammarPath);

  _languageCache.set(language, lang);
  logger.debug({ language, grammarPath }, "Loaded tree-sitter grammar");
  return lang;
}

/**
 * Parse source code into a tree-sitter AST.
 *
 * @param content   — the file content to parse
 * @param language  — which language grammar to use
 * @returns the parsed tree (caller should call `tree.delete()` when done)
 */
export async function parseSource(
  content: string,
  language: SupportedLanguage,
): Promise<Parser.Tree> {
  const lang = await loadLanguage(language);
  const parser = new Parser();
  parser.setLanguage(lang);

  const tree = parser.parse(content);
  parser.delete();

  if (!tree) {
    throw new Error(`tree-sitter parse returned null for language: ${language}`);
  }

  return tree;
}

/**
 * Reset the parser cache. Useful for testing.
 */
export function resetParserCache(): void {
  _languageCache.clear();
  _initialised = false;
}
