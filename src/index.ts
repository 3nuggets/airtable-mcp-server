import OAuthProvider, { GrantType, OAuthError } from "@cloudflare/workers-oauth-provider";
import { AirtableMCP } from "./mcp";
import { AirtableHandler } from "./handler";
import { refreshAirtableTokens } from "./tokens";
import type { Env, Props } from "./types";

export { AirtableMCP };

/**
 * Our access tokens are deliberately shorter-lived than Airtable's (60 min), so a
 * client refresh — and with it the upstream Airtable refresh below — always
 * happens while the Airtable token is still valid.
 */
const ACCESS_TOKEN_TTL = 45 * 60;

/**
 * `tokenExchangeCallback` does not receive `env`, so the outer fetch handler
 * stashes it here before delegating to the provider.
 */
let currentEnv: Env | null = null;

const provider = new OAuthProvider({
  apiHandlers: {
    "/mcp": AirtableMCP.serve("/mcp"),
    "/sse": AirtableMCP.serveSSE("/sse"),
  },
  // Everything that isn't an MCP endpoint (OAuth pages, health).
  defaultHandler: AirtableHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  // OAuth 2.1 hardening: require PKCE S256, no plain challenge, no implicit flow.
  allowImplicitFlow: false,
  allowPlainPKCE: false,
  accessTokenTTL: ACCESS_TOKEN_TTL,

  /**
   * Refresh the user's Airtable tokens whenever their MCP client refreshes with us,
   * and persist the rotated pair back into the encrypted grant props. This is what
   * lets us hold no Airtable credentials in our own storage: props are the only
   * copy, and they are re-issued here rather than written to KV by us.
   */
  async tokenExchangeCallback({ grantType, props }) {
    if (grantType !== GrantType.REFRESH_TOKEN) return;

    const p = props as Props;
    if (!p?.airtableRefreshToken) return;

    // Still comfortably valid — reuse it rather than burning a rotation.
    if (Date.now() < p.expiresAt - 5 * 60_000) return;

    const env = currentEnv;
    if (!env) return;

    try {
      const t = await refreshAirtableTokens(
        env.AIRTABLE_CLIENT_ID,
        env.AIRTABLE_CLIENT_SECRET,
        p.airtableRefreshToken,
      );
      const newProps: Props = {
        ...p,
        airtableAccessToken: t.accessToken,
        airtableRefreshToken: t.refreshToken,
        expiresAt: t.expiresAt,
        scope: t.scope,
      };
      return { newProps, accessTokenTTL: ACCESS_TOKEN_TTL };
    } catch {
      // Airtable refresh tokens die after 60 days of inactivity. Tell the client to
      // re-authorize rather than handing back a grant that can never work again.
      throw new OAuthError("invalid_grant", {
        description:
          "Your Airtable authorization has expired. Please reconnect the Airtable connector.",
      });
    }
  },
});

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    currentEnv = env;
    return provider.fetch(request, env as any, ctx);
  },
};
