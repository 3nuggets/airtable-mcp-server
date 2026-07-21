import { Hono } from "hono";
import type { AuthRequest, OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { Env, AirtableTokenResponse } from "./types";
import { saveTokens, tokensFromResponse } from "./tokens";

/**
 * OAuth scopes requested from Airtable. These MUST also be enabled on your
 * Airtable OAuth integration (https://airtable.com/create/oauth), or consent fails.
 */
export const AIRTABLE_SCOPES = [
  "data.records:read",
  "data.records:write",
  "data.recordComments:read",
  "data.recordComments:write",
  "schema.bases:read",
  "schema.bases:write",
  "webhook:manage",
  "user.email:read",
].join(" ");

const AUTHORIZE_URL = "https://airtable.com/oauth2/v1/authorize";
const TOKEN_URL = "https://airtable.com/oauth2/v1/token";
const WHOAMI_URL = "https://api.airtable.com/v0/meta/whoami";

type Bindings = Env & { OAUTH_PROVIDER: OAuthHelpers };
const app = new Hono<{ Bindings: Bindings }>();

// --- PKCE + state helpers ---------------------------------------------------

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

// --- Health -----------------------------------------------------------------

app.get("/", (c) => c.text("Airtable MCP server. Connect via /mcp (or /sse)."));
app.get("/health", (c) => c.json({ ok: true }));

// --- OAuth: claude.ai -> Worker -> Airtable ---------------------------------

// Step 1: an MCP client hits /authorize; we redirect the user to Airtable.
app.get("/authorize", async (c) => {
  const oauthReqInfo = await c.env.OAUTH_PROVIDER.parseAuthRequest(c.req.raw);
  if (!oauthReqInfo.clientId) return c.text("Invalid OAuth request", 400);

  const state = randomToken(24);
  const verifier = randomToken(32);
  const challenge = await pkceChallenge(verifier);

  await c.env.OAUTH_KV.put(
    `airtable_login:${state}`,
    JSON.stringify({ oauthReqInfo, verifier }),
    { expirationTtl: 600 },
  );

  const redirectUri = new URL("/callback", c.req.url).href;
  const u = new URL(AUTHORIZE_URL);
  u.searchParams.set("client_id", c.env.AIRTABLE_CLIENT_ID);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", AIRTABLE_SCOPES);
  u.searchParams.set("state", state);
  u.searchParams.set("code_challenge", challenge);
  u.searchParams.set("code_challenge_method", "S256");
  return c.redirect(u.href);
});

// Step 2: Airtable redirects back with ?code&state; exchange + complete grant.
app.get("/callback", async (c) => {
  const error = c.req.query("error");
  if (error) return c.text(`Airtable authorization failed: ${error}`, 400);

  const code = c.req.query("code");
  const state = c.req.query("state");
  if (!code || !state) return c.text("Missing code/state", 400);

  const stored = await c.env.OAUTH_KV.get(`airtable_login:${state}`);
  if (!stored) return c.text("Login expired or invalid state. Please try again.", 400);
  await c.env.OAUTH_KV.delete(`airtable_login:${state}`);
  const { oauthReqInfo, verifier } = JSON.parse(stored) as {
    oauthReqInfo: AuthRequest;
    verifier: string;
  };

  const redirectUri = new URL("/callback", c.req.url).href;
  const basic = btoa(`${c.env.AIRTABLE_CLIENT_ID}:${c.env.AIRTABLE_CLIENT_SECRET}`);
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }).toString(),
  });
  if (!tokenRes.ok) {
    return c.text(`Airtable token exchange failed: ${await tokenRes.text()}`, 502);
  }
  const tokenJson = (await tokenRes.json()) as AirtableTokenResponse;

  const who = (await fetch(WHOAMI_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  }).then((r) => r.json())) as { id: string; email?: string };

  const tokens = tokensFromResponse(tokenJson);
  await saveTokens(c.env, who.id, tokens);

  const { redirectTo } = await c.env.OAUTH_PROVIDER.completeAuthorization({
    request: oauthReqInfo,
    userId: who.id,
    scope: oauthReqInfo.scope,
    metadata: { label: who.email ?? who.id },
    props: {
      userId: who.id,
      email: who.email ?? "",
      airtableAccessToken: tokens.accessToken,
      airtableRefreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
    },
  });
  return c.redirect(redirectTo);
});

export { app as AirtableHandler };
