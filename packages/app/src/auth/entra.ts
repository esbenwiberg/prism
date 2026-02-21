/**
 * Azure Entra ID (formerly Azure AD) OAuth2 via MSAL.
 *
 * Provides helpers to generate the auth URL and handle the callback.
 * Requires the following environment variables:
 *   AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID, AZURE_REDIRECT_URI
 */

import {
  ConfidentialClientApplication,
  type AuthorizationCodeRequest,
  type AuthorizationUrlRequest,
  type Configuration,
} from "@azure/msal-node";
import { logger } from "@prism/core";

// ---------------------------------------------------------------------------
// MSAL configuration
// ---------------------------------------------------------------------------

function getMsalConfig(): Configuration {
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  const tenantId = process.env.AZURE_TENANT_ID;

  if (!clientId || !clientSecret || !tenantId) {
    throw new Error(
      "Missing required Azure Entra ID environment variables: " +
        "AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID",
    );
  }

  return {
    auth: {
      clientId,
      clientSecret,
      authority: `https://login.microsoftonline.com/${tenantId}`,
    },
  };
}

let _cca: ConfidentialClientApplication | undefined;

function getCca(): ConfidentialClientApplication {
  if (!_cca) {
    _cca = new ConfidentialClientApplication(getMsalConfig());
  }
  return _cca;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const SCOPES = ["user.read"];

/**
 * Generate the Azure Entra ID authorization URL.
 *
 * The user's browser should be redirected to this URL.
 */
export async function getAuthUrl(): Promise<string> {
  const redirectUri = process.env.AZURE_REDIRECT_URI ?? "http://localhost:3100/auth/callback";

  const request: AuthorizationUrlRequest = {
    scopes: SCOPES,
    redirectUri,
  };

  const cca = getCca();
  const url = await cca.getAuthCodeUrl(request);
  logger.debug({ redirectUri }, "Generated Entra ID auth URL");
  return url;
}

/**
 * Exchange the authorization code for tokens.
 *
 * @param code — The authorization code from the callback query string.
 * @returns The user's account info (name, username).
 */
export async function handleCallback(code: string): Promise<{
  name: string;
  username: string;
}> {
  const redirectUri = process.env.AZURE_REDIRECT_URI ?? "http://localhost:3100/auth/callback";

  const request: AuthorizationCodeRequest = {
    code,
    scopes: SCOPES,
    redirectUri,
  };

  const cca = getCca();
  const response = await cca.acquireTokenByCode(request);

  const account = response.account;
  const name = account?.name ?? "Unknown";
  const username = account?.username ?? "unknown";

  logger.info({ username }, "User authenticated via Entra ID");

  return { name, username };
}

/**
 * Reset the cached CCA instance (useful for testing).
 */
export function resetCca(): void {
  _cca = undefined;
}
