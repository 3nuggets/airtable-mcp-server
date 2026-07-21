import type { Env, StoredTokens, AirtableTokenResponse } from "./types";

const TOKEN_URL = "https://airtable.com/oauth2/v1/token";
/** Refresh a bit before the 60-minute access token actually expires. */
const EXPIRY_MARGIN_MS = 60_000;

const tokenKey = (userId: string) => `airtable_tokens:${userId}`;

export async function saveTokens(env: Env, userId: string, tokens: StoredTokens): Promise<void> {
  await env.OAUTH_KV.put(tokenKey(userId), JSON.stringify(tokens));
}

export async function loadTokens(env: Env, userId: string): Promise<StoredTokens | null> {
  const raw = await env.OAUTH_KV.get(tokenKey(userId));
  return raw ? (JSON.parse(raw) as StoredTokens) : null;
}

export function tokensFromResponse(res: AirtableTokenResponse): StoredTokens {
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    expiresAt: Date.now() + res.expires_in * 1000,
    scope: res.scope,
  };
}

/**
 * Exchange a refresh token for a fresh access token. Airtable rotates BOTH tokens
 * on every refresh, so the returned record must be persisted.
 */
async function refresh(env: Env, refreshToken: string): Promise<StoredTokens> {
  const basic = btoa(`${env.AIRTABLE_CLIENT_ID}:${env.AIRTABLE_CLIENT_SECRET}`);
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Airtable token refresh failed (${res.status}). You likely need to reconnect the ` +
        `Airtable connector. ${body}`,
    );
  }
  return tokensFromResponse((await res.json()) as AirtableTokenResponse);
}

/**
 * Returns a currently-valid Airtable access token for the user, refreshing and
 * persisting rotated tokens when the stored one is expired or near expiry.
 *
 * `fallback` is the token set captured at login (this.props); used to seed KV the
 * first time or if the KV record was evicted.
 */
export async function getValidAccessToken(
  env: Env,
  userId: string,
  fallback?: StoredTokens,
): Promise<string> {
  let tokens = (await loadTokens(env, userId)) ?? fallback ?? null;
  if (!tokens) {
    throw new Error("No Airtable tokens found for this session. Please reconnect the connector.");
  }
  if (Date.now() < tokens.expiresAt - EXPIRY_MARGIN_MS) {
    return tokens.accessToken;
  }
  tokens = await refresh(env, tokens.refreshToken);
  await saveTokens(env, userId, tokens);
  return tokens.accessToken;
}
