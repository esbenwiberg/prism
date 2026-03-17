/**
 * Shared Anthropic client factory.
 *
 * Reads the API key from `PrismConfig.apiKeys` first, falling back to
 * the `ANTHROPIC_API_KEY` environment variable. Supports custom base URL
 * (e.g. Azure AI Foundry) via config or `ANTHROPIC_BASE_URL` env var.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "../domain/config.js";

export function createAnthropicClient(): Anthropic {
  const apiKey = getApiKey("anthropicApiKey", "ANTHROPIC_API_KEY");
  const baseURL = getApiKey("anthropicBaseUrl", "ANTHROPIC_BASE_URL");
  return new Anthropic({
    ...(apiKey ? { apiKey } : {}),
    ...(baseURL ? { baseURL } : {}),
  });
}
