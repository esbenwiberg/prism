/**
 * Shared Anthropic client factory.
 *
 * Reads the API key from `PrismConfig.apiKeys` first, falling back to
 * the `ANTHROPIC_API_KEY` environment variable.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getApiKey } from "../domain/config.js";

export function createAnthropicClient(): Anthropic {
  const apiKey = getApiKey("anthropicApiKey", "ANTHROPIC_API_KEY");
  return new Anthropic(apiKey ? { apiKey } : {});
}
