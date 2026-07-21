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
 * Per-user context attached to the MCP grant. Available as `this.props` inside
 * the McpAgent. Airtable tokens live in OAUTH_KV (see tokens.ts) keyed by userId;
 * we also carry them here as the initial value written at login.
 */
export interface Props extends Record<string, unknown> {
  userId: string;
  email: string;
  airtableAccessToken: string;
  airtableRefreshToken: string;
  /** Epoch ms at which the access token expires. */
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

/** Persisted Airtable token record (OAUTH_KV: `airtable_tokens:<userId>`). */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  scope: string;
}
