import type { Env, Props, AirtableTokenResponse } from "./types";
import { seal, unseal, randomBase64Url, sha256Base64Url } from "./crypto";
import { tokensFromResponse } from "./tokens";

/**
 * A stateless OAuth 2.1 authorization server.
 *
 * Nothing is written to disk. The registered client, the in-flight authorization,
 * the authorization code and the access/refresh tokens are all sealed blobs held
 * by the client (see crypto.ts). We are simply an encrypted passthrough to
 * Airtable: a request arrives carrying its own credentials, we use them, we forget.
 */

const AIRTABLE_AUTHORIZE = "https://airtable.com/oauth2/v1/authorize";
const AIRTABLE_TOKEN = "https://airtable.com/oauth2/v1/token";
const AIRTABLE_WHOAMI = "https://api.airtable.com/v0/meta/whoami";

/** Scopes requested from Airtable. Must also be enabled on the OAuth integration. */
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

const PURPOSE_CLIENT = "client";
const PURPOSE_AUTHREQ = "authreq";
const PURPOSE_CODE = "code";
const PURPOSE_ACCESS = "access";
const PURPOSE_REFRESH = "refresh";

/** Authorization codes are single-use in spirit and very short-lived. */
const CODE_TTL = 5 * 60;
/** Mirrors Airtable's refresh token lifetime (60 days of inactivity). */
const REFRESH_TTL = 60 * 24 * 60 * 60;
/** Safety margin so our access token always dies before Airtable's does. */
const ACCESS_MARGIN_SECONDS = 120;

interface ClientRecord {
  redirect_uris: string[];
  client_name?: string;
}

interface AuthRequestState {
  ru: string;
  cs?: string;
  cc: string;
  verifier: string;
}

interface CodePayload {
  at: string;
  rt: string;
  exp: number;
  scope: string;
  uid: string;
  cc: string;
  ru: string;
}

interface AccessPayload {
  at: string;
  uid: string;
  exp: number;
  scope: string;
}

interface RefreshPayload {
  rt: string;
  uid: string;
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS, ...headers },
  });

const oauthError = (error: string, description: string, status = 400) =>
  json({ error, error_description: description }, status);

export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, WWW-Authenticate",
};

// --- Discovery ---------------------------------------------------------------

export function authorizationServerMetadata(origin: string): Response {
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: AIRTABLE_SCOPES.split(" "),
  });
}

export function protectedResourceMetadata(origin: string): Response {
  return json({
    resource: origin,
    authorization_servers: [origin],
    scopes_supported: AIRTABLE_SCOPES.split(" "),
    bearer_methods_supported: ["header"],
  });
}

// --- Dynamic client registration (RFC 7591) ----------------------------------

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return oauthError("invalid_client_metadata", "Body must be JSON.");
  }

  const redirectUris: string[] = Array.isArray(body?.redirect_uris) ? body.redirect_uris : [];
  if (redirectUris.length === 0) {
    return oauthError("invalid_redirect_uri", "At least one redirect_uri is required.");
  }
  for (const uri of redirectUris) {
    if (typeof uri !== "string" || !/^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)/.test(uri)) {
      return oauthError("invalid_redirect_uri", `Invalid redirect_uri: ${uri}`);
    }
  }

  // The client_id IS the registration: a sealed record, so we store nothing.
  const record: ClientRecord = { redirect_uris: redirectUris, client_name: body?.client_name };
  const clientId = await seal(env.TOKEN_SEALING_KEY, PURPOSE_CLIENT, record, null);

  return json(
    {
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      client_name: body?.client_name,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201,
  );
}

// --- Authorization -----------------------------------------------------------

export async function handleAuthorize(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams;
  const clientId = q.get("client_id") ?? "";
  const redirectUri = q.get("redirect_uri") ?? "";
  const challenge = q.get("code_challenge") ?? "";

  if (q.get("response_type") !== "code") {
    return oauthError("unsupported_response_type", "Only response_type=code is supported.");
  }
  const client = await unseal<ClientRecord>(env.TOKEN_SEALING_KEY, PURPOSE_CLIENT, clientId);
  if (!client) return oauthError("invalid_client", "Unknown or expired client_id.");
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
    return oauthError("invalid_request", "redirect_uri does not match the registered client.");
  }
  // OAuth 2.1: PKCE is mandatory and must be S256.
  if (!challenge || q.get("code_challenge_method") !== "S256") {
    return oauthError("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }

  const verifier = randomBase64Url(32);
  const state: AuthRequestState = {
    ru: redirectUri,
    cs: q.get("state") ?? undefined,
    cc: challenge,
    verifier,
  };
  // The whole pending authorization round-trips through Airtable's `state` param.
  const sealedState = await seal(env.TOKEN_SEALING_KEY, PURPOSE_AUTHREQ, state, 10 * 60);

  const upstream = new URL(AIRTABLE_AUTHORIZE);
  upstream.searchParams.set("client_id", env.AIRTABLE_CLIENT_ID);
  upstream.searchParams.set("redirect_uri", `${url.origin}/callback`);
  upstream.searchParams.set("response_type", "code");
  upstream.searchParams.set("scope", AIRTABLE_SCOPES);
  upstream.searchParams.set("state", sealedState);
  upstream.searchParams.set("code_challenge", await sha256Base64Url(verifier));
  upstream.searchParams.set("code_challenge_method", "S256");
  return Response.redirect(upstream.href, 302);
}

export async function handleCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) {
    return new Response(`Airtable authorization failed: ${error}`, { status: 400 });
  }
  const code = url.searchParams.get("code");
  const sealedState = url.searchParams.get("state");
  if (!code || !sealedState) return new Response("Missing code/state", { status: 400 });

  const state = await unseal<AuthRequestState>(
    env.TOKEN_SEALING_KEY,
    PURPOSE_AUTHREQ,
    sealedState,
  );
  if (!state) return new Response("Login expired or invalid. Please try again.", { status: 400 });

  const tokenRes = await exchangeWithAirtable(env, {
    grant_type: "authorization_code",
    code,
    redirect_uri: `${url.origin}/callback`,
    code_verifier: state.verifier,
  });
  if ("error" in tokenRes) {
    return new Response(`Airtable token exchange failed: ${tokenRes.error}`, { status: 502 });
  }
  const tokens = tokensFromResponse(tokenRes.data);

  const who = (await fetch(AIRTABLE_WHOAMI, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  }).then((r) => r.json())) as { id: string };

  // The Airtable credentials are sealed into the code the client will exchange.
  const payload: CodePayload = {
    at: tokens.accessToken,
    rt: tokens.refreshToken,
    exp: tokens.expiresAt,
    scope: tokens.scope,
    uid: who.id,
    cc: state.cc,
    ru: state.ru,
  };
  const sealedCode = await seal(env.TOKEN_SEALING_KEY, PURPOSE_CODE, payload, CODE_TTL);

  const back = new URL(state.ru);
  back.searchParams.set("code", sealedCode);
  if (state.cs) back.searchParams.set("state", state.cs);
  return Response.redirect(back.href, 302);
}

// --- Token endpoint ----------------------------------------------------------

export async function handleToken(request: Request, env: Env): Promise<Response> {
  const form = new URLSearchParams(await request.text());
  const grantType = form.get("grant_type");

  if (grantType === "authorization_code") {
    const code = form.get("code") ?? "";
    const verifier = form.get("code_verifier") ?? "";
    const redirectUri = form.get("redirect_uri") ?? "";

    const payload = await unseal<CodePayload>(env.TOKEN_SEALING_KEY, PURPOSE_CODE, code);
    if (!payload) return oauthError("invalid_grant", "Authorization code is invalid or expired.");
    if (payload.ru !== redirectUri) {
      return oauthError("invalid_grant", "redirect_uri does not match the authorization request.");
    }
    if (!verifier || (await sha256Base64Url(verifier)) !== payload.cc) {
      return oauthError("invalid_grant", "PKCE verification failed.");
    }
    return issueTokens(env, {
      accessToken: payload.at,
      refreshToken: payload.rt,
      expiresAt: payload.exp,
      scope: payload.scope,
      userId: payload.uid,
    });
  }

  if (grantType === "refresh_token") {
    const payload = await unseal<RefreshPayload>(
      env.TOKEN_SEALING_KEY,
      PURPOSE_REFRESH,
      form.get("refresh_token") ?? "",
    );
    if (!payload) return oauthError("invalid_grant", "Refresh token is invalid or expired.");

    // Airtable rotates both tokens; the new pair is sealed straight back to the client.
    const refreshed = await exchangeWithAirtable(env, {
      grant_type: "refresh_token",
      refresh_token: payload.rt,
    });
    if ("error" in refreshed) {
      return oauthError(
        "invalid_grant",
        "Your Airtable authorization has expired. Please reconnect the connector.",
      );
    }
    const tokens = tokensFromResponse(refreshed.data);
    return issueTokens(env, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      userId: payload.uid,
    });
  }

  return oauthError("unsupported_grant_type", `Unsupported grant_type: ${grantType}`);
}

async function issueTokens(
  env: Env,
  t: { accessToken: string; refreshToken: string; expiresAt: number; scope: string; userId: string },
): Promise<Response> {
  // Our access token expires slightly before Airtable's, so a refresh always
  // happens while the upstream token is still usable.
  const remaining = Math.floor((t.expiresAt - Date.now()) / 1000) - ACCESS_MARGIN_SECONDS;
  const accessTtl = Math.max(60, remaining);

  const accessPayload: AccessPayload = {
    at: t.accessToken,
    uid: t.userId,
    exp: t.expiresAt,
    scope: t.scope,
  };
  const refreshPayload: RefreshPayload = { rt: t.refreshToken, uid: t.userId };

  return json({
    access_token: await seal(env.TOKEN_SEALING_KEY, PURPOSE_ACCESS, accessPayload, accessTtl),
    token_type: "Bearer",
    expires_in: accessTtl,
    refresh_token: await seal(env.TOKEN_SEALING_KEY, PURPOSE_REFRESH, refreshPayload, REFRESH_TTL),
    scope: t.scope,
  });
}

async function exchangeWithAirtable(
  env: Env,
  params: Record<string, string>,
): Promise<{ data: AirtableTokenResponse } | { error: string }> {
  const basic = btoa(`${env.AIRTABLE_CLIENT_ID}:${env.AIRTABLE_CLIENT_SECRET}`);
  const res = await fetch(AIRTABLE_TOKEN, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) return { error: `${res.status} ${await res.text()}` };
  return { data: (await res.json()) as AirtableTokenResponse };
}

// --- Request authentication --------------------------------------------------

/** Resolve the caller's Airtable credentials from the bearer token. */
export async function authenticate(request: Request, env: Env): Promise<Props | null> {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Bearer (.+)$/i.exec(header);
  if (!match) return null;

  const payload = await unseal<AccessPayload>(env.TOKEN_SEALING_KEY, PURPOSE_ACCESS, match[1]);
  if (!payload) return null;
  return {
    userId: payload.uid,
    airtableAccessToken: payload.at,
    expiresAt: payload.exp,
    scope: payload.scope,
  };
}

export function unauthorized(origin: string): Response {
  return new Response(JSON.stringify({ error: "invalid_token" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
      ...CORS,
    },
  });
}
