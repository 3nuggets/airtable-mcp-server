import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { AirtableMCP } from "./mcp";
import { AirtableHandler } from "./handler";

export { AirtableMCP };

export default new OAuthProvider({
  apiHandlers: {
    "/mcp": AirtableMCP.serve("/mcp"),
    "/sse": AirtableMCP.serveSSE("/sse"),
  },
  // Everything that isn't an MCP endpoint (OAuth pages, /files, /upload, health).
  defaultHandler: AirtableHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  // OAuth 2.1 hardening: require PKCE S256, no plain challenge, no implicit flow.
  allowImplicitFlow: false,
  allowPlainPKCE: false,
});
