/**
 * Worker environment. Note there are NO storage bindings: no KV, no R2, no Durable
 * Objects. This server keeps nothing — it only needs the credentials required to
 * talk to Airtable and the key used to seal stateless tokens.
 */
export interface Env {
  /** From your Airtable OAuth integration. */
  AIRTABLE_CLIENT_ID: string;
  AIRTABLE_CLIENT_SECRET: string;
  /** Seals every stateless token this server issues. Rotating it logs everyone out. */
  TOKEN_SEALING_KEY: string;
}

/**
 * The caller's identity for a single request, decrypted from their bearer token.
 * It exists only for the lifetime of that request and is never written anywhere.
 */
export interface Props {
  userId: string;
  airtableAccessToken: string;
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

/** An Airtable token pair, held only in-flight. */
export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
  scope: string;
}
