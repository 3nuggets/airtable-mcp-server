import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";

/**
 * Worker bindings + secrets. Binding types (MCP_OBJECT, OAUTH_KV, ATTACHMENTS_BUCKET)
 * come from the generated `Cloudflare.Env` (see worker-configuration.d.ts, produced by
 * `npm run cf-typegen`). Secrets and the OAuthProvider-injected helper are added here.
 */
export interface Env extends Cloudflare.Env {
  /** Injected into the default handler's env by OAuthProvider. */
  OAUTH_PROVIDER: OAuthHelpers;

  // Secrets (set via `wrangler secret put`)
  AIRTABLE_CLIENT_ID: string;
  AIRTABLE_CLIENT_SECRET: string;
  /** R2 S3 API token, used to presign upload/download URLs for staging attachments. */
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  // R2_ACCOUNT_ID comes from Cloudflare.Env (wrangler.jsonc vars).
}

/**
 * Per-user context attached to the MCP grant, available as `this.props` in the
 * McpAgent. This is the ONLY place a user's Airtable tokens live: the OAuth
 * provider encrypts props into that user's access token, so they cannot be read
 * at rest without the token itself. We never copy them into our own storage.
 */
export interface Props extends Record<string, unknown> {
  userId: string;
  airtableAccessToken: string;
  airtableRefreshToken: string;
  /** Epoch ms at which the Airtable access token expires. */
  expiresAt: number;
  scope: string;
}

/** Airtable OAuth token endpoint response. */
export interface AirtableTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_expires_in: number;
}

/** An Airtable token pair, carried in encrypted `props` (never stored by us). */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  scope: string;
}
