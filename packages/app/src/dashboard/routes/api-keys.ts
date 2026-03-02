/**
 * API key management routes (dashboard UI).
 *
 * These are session-protected routes (requireAuth is applied globally in
 * server.ts before these are registered).
 *
 * Routes:
 *   GET    /api-keys        — list all keys
 *   POST   /api-keys        — create a new key (returns raw key once in flash)
 *   DELETE /api-keys/:id    — revoke (delete) a key
 */

import { Router } from "express";
import { listApiKeys, createApiKey, deleteApiKey, getApiKeyById, updateApiKey, logger } from "@prism/core";
import { apiKeysPage, apiKeysFragment, apiKeyEditFragment } from "../views/index.js";

export const apiKeysRouter = Router();

// ---------------------------------------------------------------------------
// GET /api-keys
// ---------------------------------------------------------------------------

apiKeysRouter.get("/api-keys", async (req, res) => {
  try {
    const keys = await listApiKeys();
    const userName = req.session.user?.name ?? "User";

    if (req.headers["hx-request"]) {
      res.send(apiKeysFragment({ apiKeys: keys, userName }));
      return;
    }

    res.send(apiKeysPage({ apiKeys: keys, userName }));
  } catch (err) {
    logger.error({ err }, "Failed to list API keys");
    res.status(500).send("Internal server error");
  }
});

// ---------------------------------------------------------------------------
// POST /api-keys — create
// ---------------------------------------------------------------------------

apiKeysRouter.post("/api-keys", async (req, res) => {
  try {
    const { name, perm_read, perm_register, perm_index } = req.body as {
      name?: string;
      perm_read?: string;
      perm_register?: string;
      perm_index?: string;
    };

    if (!name || !name.trim()) {
      res.status(400).send("Name is required");
      return;
    }

    const permissions: string[] = [];
    if (perm_read) permissions.push("read");
    if (perm_register) permissions.push("register");
    if (perm_index) permissions.push("index");
    if (permissions.length === 0) permissions.push("read");

    const { row, rawKey } = await createApiKey({ name: name.trim(), permissions });
    logger.info({ id: row.id, name: row.name, prefix: row.keyPrefix }, "API key created");

    const keys = await listApiKeys();
    const userName = req.session.user?.name ?? "User";

    if (req.headers["hx-request"]) {
      res.send(apiKeysFragment({ apiKeys: keys, userName, newKey: rawKey }));
      return;
    }

    // Non-HTMX fallback: redirect to GET with the key in session flash
    // (Simple redirect; key will be lost — HTMX path is the intended flow)
    res.redirect("/api-keys");
  } catch (err) {
    logger.error({ err }, "Failed to create API key");
    res.status(500).send("Failed to create API key");
  }
});

// ---------------------------------------------------------------------------
// GET /api-keys/:id/edit — edit form
// ---------------------------------------------------------------------------

apiKeysRouter.get("/api-keys/:id/edit", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).send("Invalid key ID");
      return;
    }

    const apiKey = await getApiKeyById(id);
    if (!apiKey) {
      res.status(404).send("API key not found");
      return;
    }

    res.send(apiKeyEditFragment({ apiKey }));
  } catch (err) {
    logger.error({ err }, "Failed to load API key edit form");
    res.status(500).send("Internal server error");
  }
});

// ---------------------------------------------------------------------------
// PUT /api-keys/:id — update permissions
// ---------------------------------------------------------------------------

apiKeysRouter.put("/api-keys/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).send("Invalid key ID");
      return;
    }

    const { perm_read, perm_register, perm_index } = req.body as {
      perm_read?: string;
      perm_register?: string;
      perm_index?: string;
    };

    const permissions: string[] = [];
    if (perm_read) permissions.push("read");
    if (perm_register) permissions.push("register");
    if (perm_index) permissions.push("index");
    if (permissions.length === 0) permissions.push("read");

    await updateApiKey(id, { permissions });
    logger.info({ id, permissions }, "API key permissions updated");

    const keys = await listApiKeys();
    const userName = req.session.user?.name ?? "User";

    if (req.headers["hx-request"]) {
      res.send(apiKeysFragment({ apiKeys: keys, userName, flash: "Permissions updated." }));
      return;
    }

    res.redirect("/api-keys");
  } catch (err) {
    logger.error({ err }, "Failed to update API key");
    res.status(500).send("Failed to update API key");
  }
});

// ---------------------------------------------------------------------------
// DELETE /api-keys/:id — revoke
// ---------------------------------------------------------------------------

apiKeysRouter.delete("/api-keys/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).send("Invalid key ID");
      return;
    }

    await deleteApiKey(id);
    logger.info({ id }, "API key revoked");

    const keys = await listApiKeys();
    const userName = req.session.user?.name ?? "User";

    if (req.headers["hx-request"]) {
      res.send(apiKeysFragment({ apiKeys: keys, userName, flash: "API key revoked." }));
      return;
    }

    res.redirect("/api-keys");
  } catch (err) {
    logger.error({ err }, "Failed to revoke API key");
    res.status(500).send("Failed to revoke API key");
  }
});
