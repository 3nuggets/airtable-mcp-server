import type { Env } from "./types";
import {
  CORS,
  authenticate,
  authorizationServerMetadata,
  handleAuthorize,
  handleCallback,
  handleRegister,
  handleToken,
  protectedResourceMetadata,
  unauthorized,
} from "./oauth";
import { buildServer } from "./mcp";
import { runMessages } from "./transport";
import { landingPage, privacyPage, termsPage } from "./pages";
import { handleUpload } from "./upload";
import {
  FAVICON_SVG,
  FAVICON_SVG_ON_DARK,
  FAVICON_32_PNG,
  APPLE_TOUCH_PNG,
  ICON_512_PNG,
  pngResponse,
  svgResponse,
} from "./assets";

/**
 * Airtable MCP server — a stateless execution proxy.
 *
 * There are no storage bindings. Each request carries its own sealed credentials,
 * is executed against Airtable, and leaves nothing behind: no tokens, no user data,
 * no documents, no session state.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = url.origin;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    switch (url.pathname) {
      case "/":
        return landingPage(origin);

      // Required by Airtable before users other than the integration owner may
      // authorize it, and shown to users on the consent screen.
      case "/privacy":
        return privacyPage(origin);

      case "/terms":
        return termsPage(origin);

      // Brand icons. MCP clients and browsers pick the connector's logo up from
      // here (and from the `icons` declared in the MCP handshake).
      case "/favicon.svg":
        return svgResponse(FAVICON_SVG);

      // Browsers request /favicon.ico by convention and expect a raster image.
      case "/favicon.ico":
        return pngResponse(FAVICON_32_PNG);

      case "/icon-on-dark.svg":
        return svgResponse(FAVICON_SVG_ON_DARK);

      case "/favicon-32.png":
        return pngResponse(FAVICON_32_PNG);

      case "/apple-touch-icon.png":
      case "/apple-touch-icon-precomposed.png":
        return pngResponse(APPLE_TOUCH_PNG);

      case "/icon-512.png":
        return pngResponse(ICON_512_PNG);

      case "/health":
        return new Response(JSON.stringify({ ok: true }), {
          headers: { "Content-Type": "application/json", ...CORS },
        });

      case "/.well-known/oauth-authorization-server":
        return authorizationServerMetadata(origin);

      case "/.well-known/oauth-protected-resource":
      case "/.well-known/oauth-protected-resource/mcp":
        return protectedResourceMetadata(origin);

      case "/register":
        if (request.method !== "POST") return methodNotAllowed();
        return handleRegister(request, env);

      case "/authorize":
        return handleAuthorize(request, env);

      case "/callback":
        return handleCallback(request, env);

      case "/token":
        if (request.method !== "POST") return methodNotAllowed();
        return handleToken(request, env);

      // Receives file bytes from the in-chat uploader widget, authorized by a
      // sealed ticket rather than a bearer token. Bytes are forwarded to
      // Airtable and dropped; nothing is written down.
      case "/upload":
        return handleUpload(request, env);

      case "/mcp":
        return handleMcp(request, env, origin);
    }

    return new Response("Not found", { status: 404, headers: CORS });
  },
};

function methodNotAllowed(): Response {
  return new Response("Method not allowed", { status: 405, headers: CORS });
}

async function handleMcp(request: Request, env: Env, origin: string): Promise<Response> {
  // No sessions to resume or tear down, so only POST carries meaning.
  if (request.method === "GET" || request.method === "DELETE") {
    return new Response(null, { status: 405, headers: CORS });
  }
  if (request.method !== "POST") return methodNotAllowed();

  const props = await authenticate(request, env);
  if (!props) return unauthorized(origin);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  const messages = Array.isArray(body) ? body : [body];
  const server = buildServer(env, props, origin);

  try {
    const replies = await runMessages(server, messages);
    // Notifications only — nothing to return.
    if (replies.length === 0) return new Response(null, { status: 202, headers: CORS });
    const payload = Array.isArray(body) ? replies : replies[0];
    return new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json", ...CORS },
    });
  } catch (e) {
    const id = (messages[0] as any)?.id ?? null;
    return jsonRpcError(id, -32603, e instanceof Error ? e.message : "Internal error");
  }
}

function jsonRpcError(id: unknown, code: number, message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status: 200,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
