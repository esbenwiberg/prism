/**
 * Credential routes -- GET / POST / DELETE for managing git PATs.
 *
 * PATs are encrypted with AES-256-GCM before storage.
 * Decrypted tokens are never sent to the browser.
 */

import { Router } from "express";
import {
  listCredentials,
  createCredential,
  deleteCredential,
  encryptToken,
  logger,
} from "@prism/core";
import type { GitProvider } from "@prism/core";
import { credentialsPage, credentialsFragment } from "../views/index.js";

export const credentialsRouter = Router();

// ---------------------------------------------------------------------------
// GET /credentials — list all credentials
// ---------------------------------------------------------------------------

credentialsRouter.get("/credentials", async (req, res) => {
  try {
    const credentials = await listCredentials();
    const userName = req.session.user?.name ?? "User";

    if (req.headers["hx-request"]) {
      res.send(credentialsFragment({ credentials, userName }));
      return;
    }

    res.send(credentialsPage({ credentials, userName }));
  } catch (err) {
    logger.error({ err }, "Failed to list credentials");
    res.status(500).send("Internal server error");
  }
});

// ---------------------------------------------------------------------------
// POST /credentials — create a new credential
// ---------------------------------------------------------------------------

credentialsRouter.post("/credentials", async (req, res) => {
  try {
    const { label, provider, token } = req.body as {
      label?: string;
      provider?: string;
      token?: string;
    };

    // Validation
    if (!label || !provider || !token) {
      res.status(400).send("Missing required fields: label, provider, token");
      return;
    }

    if (provider !== "github" && provider !== "azuredevops") {
      res.status(400).send("Invalid provider. Must be github or azuredevops.");
      return;
    }

    const encryptionKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
    if (!encryptionKey) {
      logger.error("CREDENTIAL_ENCRYPTION_KEY environment variable is not set");
      res.status(500).send("Server configuration error: encryption key not set");
      return;
    }

    const encryptedToken = encryptToken(token, encryptionKey);

    await createCredential({
      label,
      provider: provider as GitProvider,
      encryptedToken,
    });

    // Re-fetch the list and return updated content
    const credentials = await listCredentials();
    const userName = req.session.user?.name ?? "User";

    if (req.headers["hx-request"]) {
      res.send(credentialsFragment({ credentials, userName, flash: `Credential "${label}" added.` }));
      return;
    }

    res.redirect("/credentials");
  } catch (err) {
    logger.error({ err }, "Failed to create credential");
    res.status(500).send("Failed to create credential");
  }
});

// ---------------------------------------------------------------------------
// DELETE /credentials/:id — delete a credential
// ---------------------------------------------------------------------------

credentialsRouter.delete("/credentials/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      res.status(400).send("Invalid credential ID");
      return;
    }

    await deleteCredential(id);

    // Re-fetch the list and return updated content
    const credentials = await listCredentials();
    const userName = req.session.user?.name ?? "User";

    if (req.headers["hx-request"]) {
      res.send(credentialsFragment({ credentials, userName, flash: "Credential deleted." }));
      return;
    }

    res.redirect("/credentials");
  } catch (err) {
    logger.error({ err }, "Failed to delete credential");
    res.status(500).send("Failed to delete credential");
  }
});
