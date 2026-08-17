import type { StoredTokens, AirtableTokenResponse } from "./types";

const TOKEN_URL = "https://airtable.com/oauth2/v1/token";

/**
 * Airtable token handling is deliberately STATELESS on our side: we never write a
 * user's Airtable tokens to our own storage. They live only inside the OAuth
 * provider's `props`, which are encrypted into that user's access token and can
 * only be decrypted when that user presents it. Rotated tokens are persisted by
 * returning `newProps` from `tokenExchangeCallback` (see index.ts).
 */

export function tokensFromResponse(res: AirtableTokenResponse): StoredTokens {
  return {
    accessToken: res.access_token,
    refreshToken: res.refresh_token,
    // Treat the token as expiring slightly early so refreshes happen in good time.
    expiresAt: Date.now() + res.expires_in * 1000,
    scope: res.scope,
  };
}

/**
 * Exchange a refresh token for a fresh Airtable access token. Airtable rotates
 * BOTH tokens on every refresh, so the caller MUST persist the returned pair
 * (via newProps) or the grant chain breaks.
 *
 * Throws on failure; callers translate that into an OAuth `invalid_grant` so the
 * client re-runs the authorization flow.
 */
export async function refreshAirtableTokens(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<StoredTokens> {
  const basic = btoa(`${clientId}:${clientSecret}`);
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
    throw new Error(`Airtable token refresh failed (${res.status}): ${await res.text()}`);
  }
  return tokensFromResponse((await res.json()) as AirtableTokenResponse);
}
