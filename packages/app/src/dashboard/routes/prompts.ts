import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  listPromptFiles,
  readPrompt,
  writePrompt,
  readOriginalPrompt,
  validatePromptPath,
} from "../../prompts.js";
import { promptsPage, promptEditorPartial } from "../views/prompts.js";

const router = Router();

// ── Route patterns ───────────────────────────────────────────────────────────
// Express 5 (path-to-regexp v8) dropped `:name(*)` syntax.
// Regex routes are used here to match multi-segment prompt paths reliably.
// IMPORTANT: the /reset route must be registered before the general POST
// so that "/file.md/reset" is not caught by the general write handler.

const PROMPT_PATH_RE = /^\/api\/prompts\/(.+)$/;
const PROMPT_RESET_RE = /^\/api\/prompts\/(.+)\/reset$/;

function promptParam(req: Request): string {
  // For regex routes Express populates req.params with capture groups at
  // numeric string keys ("0", "1", …).
  return (req.params as unknown as Record<string, string>)[0] ?? "";
}

// ── GET /api/prompts/:path — Read a prompt file (HTMX partial) ────────────────

router.get(PROMPT_PATH_RE, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const relativePath = promptParam(req);

    try {
      validatePromptPath(relativePath);
    } catch (err) {
      res.status(400).send((err as Error).message);
      return;
    }

    const content = await readPrompt(relativePath);
    res.send(promptEditorPartial(relativePath, content));
  } catch (err) {
    next(err);
  }
});

// ── POST /api/prompts/:path/reset — Reset to git-committed version ────────────
// Must be registered BEFORE the general POST to take priority.

router.post(PROMPT_RESET_RE, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const relativePath = promptParam(req);

    try {
      validatePromptPath(relativePath);
    } catch (err) {
      res.status(400).send((err as Error).message);
      return;
    }

    const original = await readOriginalPrompt(relativePath);
    if (original === null) {
      res.status(404).send("No committed version found");
      return;
    }

    await writePrompt(relativePath, original);

    res.setHeader(
      "HX-Trigger",
      JSON.stringify({ showToast: { message: "Prompt reset to original", type: "success" } }),
    );
    res.send(promptEditorPartial(relativePath, original));
  } catch (err) {
    next(err);
  }
});

// ── POST /api/prompts/:path — Write a prompt file ─────────────────────────────

router.post(PROMPT_PATH_RE, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const relativePath = promptParam(req);

    try {
      validatePromptPath(relativePath);
    } catch (err) {
      res.status(400).send((err as Error).message);
      return;
    }

    const content = typeof req.body.content === "string" ? req.body.content : "";
    await writePrompt(relativePath, content);

    res.setHeader(
      "HX-Trigger",
      JSON.stringify({ showToast: { message: "Prompt saved", type: "success" } }),
    );
    res.send(promptEditorPartial(relativePath, content));
  } catch (err) {
    next(err);
  }
});

// ── GET /prompts — Full prompts page ─────────────────────────────────────────

router.get("/prompts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userName = req.session.user?.name ?? "User";
    const files = await listPromptFiles();
    res.send(promptsPage(files, userName));
  } catch (err) {
    next(err);
  }
});

export default router;
