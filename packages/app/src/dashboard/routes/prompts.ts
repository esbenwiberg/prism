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

// ── GET /prompts ─ Full prompts page ─────────────────────────────────────────

router.get("/prompts", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userName = req.session.user?.name ?? "User";
    const files = await listPromptFiles();
    res.send(promptsPage(files, userName));
  } catch (err) {
    next(err);
  }
});

// ── GET /api/prompts/:path(*) ─ Read a prompt file (HTMX partial) ────────────

router.get("/api/prompts/:path(*)", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const relativePath = req.params.path as string;

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

// ── POST /api/prompts/:path(*) ─ Write a prompt file ─────────────────────────

router.post("/api/prompts/:path(*)", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const relativePath = req.params.path as string;

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

// ── POST /api/prompts/:path(*)/reset ─ Reset prompt to git-committed version ──

router.post("/api/prompts/:path(*)/reset", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const relativePath = req.params.path as string;

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

export default router;
