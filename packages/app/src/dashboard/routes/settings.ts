import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { getConfig, saveConfig } from "@prism/core";
import type { SettingsTab } from "../views/settings.js";
import {
  settingsPage,
  settingsPanel,
  analysisTabPartial,
  indexerTabPartial,
  apiKeysTabPartial,
  dashboardTabPartial,
} from "../views/settings.js";

const router = Router();

const VALID_TABS = new Set<SettingsTab>(["analysis", "indexer", "apikeys", "dashboard"]);

function isValidTab(value: unknown): value is SettingsTab {
  return typeof value === "string" && VALID_TABS.has(value as SettingsTab);
}

// ── GET /settings ─ Full settings page ──────────────────────────────────────

router.get("/settings", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const config = getConfig();
    const userName = req.session.user?.name ?? "User";
    const tab: SettingsTab = isValidTab(req.query.tab) ? req.query.tab : "analysis";
    res.send(settingsPage(config, userName, tab));
  } catch (err) {
    next(err);
  }
});

// ── GET /settings/tab ─ HTMX partial for tab switching ──────────────────────

router.get("/settings/tab", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tab = req.query.tab;
    if (!isValidTab(tab)) {
      res.status(400).send("Invalid tab. Must be one of: analysis, indexer, apikeys");
      return;
    }

    const config = getConfig();

    // When the API Keys tab dropdowns change, form values come as query params.
    // Apply them as overrides so the correct credential fields render.
    if (tab === "apikeys") {
      const ep = req.query.embeddingProvider;
      if (typeof ep === "string" && ep) {
        config.semantic.embeddingProvider = ep;
      }
      const lp = req.query.llmProvider;
      if (lp === "azure-foundry" && !config.apiKeys.anthropicBaseUrl) {
        config.apiKeys.anthropicBaseUrl = " "; // non-empty to trigger Azure UI
      } else if (lp === "anthropic") {
        config.apiKeys.anthropicBaseUrl = "";
      }
    }

    const tabContent =
      tab === "apikeys"
        ? apiKeysTabPartial(config)
        : tab === "indexer"
          ? indexerTabPartial(config)
          : tab === "dashboard"
            ? dashboardTabPartial(config)
            : analysisTabPartial(config);
    res.send(settingsPanel(tab, tabContent));
  } catch (err) {
    next(err);
  }
});

// ── POST /settings/analysis ─ Save semantic/analysis/blueprint settings ──────

router.post("/settings/analysis", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as Record<string, string>;

    // Validate model fields (non-empty strings)
    const semanticModel = body.semantic_model?.trim();
    const analysisModel = body.analysis_model?.trim();
    const blueprintModel = body.blueprint_model?.trim();

    if (!semanticModel) {
      res.status(400).send("Semantic model is required");
      return;
    }
    if (!analysisModel) {
      res.status(400).send("Analysis model is required");
      return;
    }
    if (!blueprintModel) {
      res.status(400).send("Blueprint model is required");
      return;
    }

    // Validate embedding fields
    const VALID_EMBEDDING_PROVIDERS = ["voyage", "openai", "azure-openai"];
    const embeddingProvider = body.semantic_embeddingProvider?.trim();
    const embeddingModel = body.semantic_embeddingModel?.trim();
    const embeddingDimensions = parseInt(body.semantic_embeddingDimensions ?? "", 10);

    if (!embeddingProvider || !VALID_EMBEDDING_PROVIDERS.includes(embeddingProvider)) {
      res.status(400).send("Embedding provider must be one of: voyage, openai, azure-openai");
      return;
    }
    if (!embeddingModel) {
      res.status(400).send("Embedding model is required");
      return;
    }
    if (isNaN(embeddingDimensions) || embeddingDimensions < 1) {
      res.status(400).send("Embedding dimensions must be a positive integer");
      return;
    }

    // Validate budget fields
    const semanticBudget = parseFloat(body.semantic_budgetUsd ?? "");
    const analysisBudget = parseFloat(body.analysis_budgetUsd ?? "");
    const blueprintBudget = parseFloat(body.blueprint_budgetUsd ?? "");

    if (isNaN(semanticBudget) || semanticBudget < 0) {
      res.status(400).send("Semantic budget must be a non-negative number");
      return;
    }
    if (isNaN(analysisBudget) || analysisBudget < 0) {
      res.status(400).send("Analysis budget must be a non-negative number");
      return;
    }
    if (isNaN(blueprintBudget) || blueprintBudget < 0) {
      res.status(400).send("Blueprint budget must be a non-negative number");
      return;
    }

    const updatedConfig = await saveConfig({
      semantic: { model: semanticModel, budgetUsd: semanticBudget, embeddingProvider, embeddingModel, embeddingDimensions },
      analysis: { model: analysisModel, budgetUsd: analysisBudget },
      blueprint: { model: blueprintModel, budgetUsd: blueprintBudget },
    });

    res.setHeader(
      "HX-Trigger",
      JSON.stringify({ showToast: { message: "Analysis settings saved", type: "success" } }),
    );
    res.send(analysisTabPartial(updatedConfig));
  } catch (err) {
    next(err);
  }
});

// ── POST /settings/indexer ─ Save indexer/structural settings ────────────────

router.post("/settings/indexer", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as Record<string, string>;

    const batchSize = parseInt(body.indexer_batchSize ?? "", 10);
    const maxConcurrentBatches = parseInt(body.indexer_maxConcurrentBatches ?? "", 10);
    const incrementalByDefault = body.indexer_incrementalByDefault === "true";
    const maxFileSizeBytes = parseInt(body.structural_maxFileSizeBytes ?? "", 10);
    const skipPatternsRaw = body.structural_skipPatterns ?? "";

    if (isNaN(batchSize) || batchSize < 1) {
      res.status(400).send("Batch size must be a positive integer");
      return;
    }
    if (isNaN(maxConcurrentBatches) || maxConcurrentBatches < 1) {
      res.status(400).send("Max concurrent batches must be a positive integer");
      return;
    }
    if (isNaN(maxFileSizeBytes) || maxFileSizeBytes < 1) {
      res.status(400).send("Max file size must be a positive integer");
      return;
    }

    const skipPatterns = skipPatternsRaw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const updatedConfig = await saveConfig({
      indexer: { batchSize, maxConcurrentBatches, incrementalByDefault },
      structural: { maxFileSizeBytes, skipPatterns },
    });

    res.setHeader(
      "HX-Trigger",
      JSON.stringify({ showToast: { message: "Indexer settings saved", type: "success" } }),
    );
    res.send(indexerTabPartial(updatedConfig));
  } catch (err) {
    next(err);
  }
});

// ── POST /settings/dashboard ─ Save dashboard settings ───────────────────────

router.post("/settings/dashboard", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as Record<string, string>;
    const corsOriginsRaw = body.dashboard_corsOrigins ?? "";

    const corsOrigins = corsOriginsRaw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    // Basic validation: each origin should be a URL or "*"
    const invalid = corsOrigins.filter(
      (o) => o !== "*" && !o.startsWith("http://") && !o.startsWith("https://"),
    );
    if (invalid.length > 0) {
      res.status(400).send(`Invalid origin(s): ${invalid.join(", ")} — must start with http:// or https://, or use *`);
      return;
    }

    const updatedConfig = await saveConfig({
      dashboard: { corsOrigins },
    });

    res.setHeader(
      "HX-Trigger",
      JSON.stringify({ showToast: { message: "Dashboard settings saved", type: "success" } }),
    );
    res.send(dashboardTabPartial(updatedConfig));
  } catch (err) {
    next(err);
  }
});

// ── POST /settings/apikeys ─ Save API key settings ───────────────────────────

const MASK_PREFIX = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

router.post("/settings/apikeys", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as Record<string, string>;
    const current = getConfig().apiKeys;

    // For each key, if the submitted value matches the masked form, keep the existing value.
    // If empty, clear it. Otherwise, use the new value.
    function resolveKey(field: string, existing: string): string {
      const submitted = (body[field] ?? "").trim();
      if (!submitted) return "";
      if (submitted.startsWith(MASK_PREFIX)) return existing;
      return submitted;
    }

    const apiKeys = {
      anthropicApiKey: resolveKey("anthropicApiKey", current.anthropicApiKey),
      anthropicBaseUrl: resolveKey("anthropicBaseUrl", current.anthropicBaseUrl),
      azureOpenaiEndpoint: resolveKey("azureOpenaiEndpoint", current.azureOpenaiEndpoint),
      azureOpenaiApiKey: resolveKey("azureOpenaiApiKey", current.azureOpenaiApiKey),
      voyageApiKey: resolveKey("voyageApiKey", current.voyageApiKey),
      openaiApiKey: resolveKey("openaiApiKey", current.openaiApiKey),
    };

    // Build semantic/analysis/blueprint config from model fields
    const semantic: Record<string, unknown> = {};
    if (body.embeddingProvider && ["voyage", "openai", "azure-openai"].includes(body.embeddingProvider)) {
      semantic.embeddingProvider = body.embeddingProvider;
    }
    if (body.semantic_model) semantic.model = body.semantic_model;
    if (body.semantic_embeddingModel) semantic.embeddingModel = body.semantic_embeddingModel;
    if (body.semantic_embeddingDimensions) semantic.embeddingDimensions = Number(body.semantic_embeddingDimensions);

    const analysis: Record<string, unknown> = {};
    if (body.analysis_model) analysis.model = body.analysis_model;

    const blueprint: Record<string, unknown> = {};
    if (body.blueprint_model) blueprint.model = body.blueprint_model;

    const updatedConfig = await saveConfig({
      apiKeys,
      ...(Object.keys(semantic).length > 0 ? { semantic } : {}),
      ...(Object.keys(analysis).length > 0 ? { analysis } : {}),
      ...(Object.keys(blueprint).length > 0 ? { blueprint } : {}),
    });

    res.setHeader(
      "HX-Trigger",
      JSON.stringify({ showToast: { message: "Settings saved", type: "success" } }),
    );
    res.send(apiKeysTabPartial(updatedConfig));
  } catch (err) {
    next(err);
  }
});

export default router;
