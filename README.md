# Airtable MCP Server

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the **full Airtable Web API** to Claude — including **document upload and download**, which the official Airtable connector does not support.

It runs on **Cloudflare Workers**, and every user signs in with **their own Airtable account** via OAuth 2.1 (PKCE-S256). One URL, their own login, done — nobody needs access to your Cloudflare account.

Works as a **claude.ai custom connector**, in **Claude Desktop**, and in **Claude Code**.

---

## It stores nothing

This server is an execution proxy, not a database. It runs tasks and keeps no record of them.

- **No storage bindings at all** — no KV, no R2, no Durable Objects, no database. Check [wrangler.jsonc](wrangler.jsonc): there is nothing to store into.
- **No credentials at rest.** There is no server-side session or grant table. Every token this server issues is a *sealed* blob (AES-GCM) that the client holds; it carries the user's Airtable credentials inside itself. A request arrives carrying its own authorization, we decrypt it in memory, call Airtable, and discard it.
- **No user data.** Records stream straight through to the Airtable API. Nothing is cached or logged.
- **No documents.** Uploaded bytes are passed directly to Airtable's upload endpoint and dropped; downloads return Airtable's own temporary URL.
- **No session state.** Each HTTP request builds an MCP server instance, answers one message, and throws it away.

The only persistent value is `TOKEN_SEALING_KEY` — a server secret, not user data. Rotating it invalidates every issued token at once.

**Consequence to be aware of:** because there are no grant records, there is no server-side "revoke this user" button. Revocation lives where it belongs — a user removes the integration in **their own Airtable account settings** — and rotating the sealing key logs everyone out.

## Architecture

| Piece | What it does |
|---|---|
| Stateless OAuth 2.1 AS ([oauth.ts](src/oauth.ts)) | Dynamic client registration, authorize, callback, token — all state sealed into the client's own credentials |
| Sealed tokens ([crypto.ts](src/crypto.ts)) | AES-GCM envelopes bound to a purpose and an expiry, so a token of one kind can't be replayed as another |
| Airtable OAuth (upstream) | Each user authorizes their own account; rotated refresh tokens are re-sealed back to the client |
| Request-scoped transport ([transport.ts](src/transport.ts)) | A Workers-native MCP transport — no sessions, no Durable Objects |

Transport: **Streamable HTTP** at `/mcp`, answering with `application/json`.

---

## Tools

**Records** — `list_records`, `get_record`, `create_records`, `update_records` (PATCH + upsert), `replace_records` (PUT), `delete_records` *(create/update/delete auto-batch in groups of 10)*

**Schema** — `list_bases`, `get_base_schema`, `create_base`, `create_table`, `update_table`, `create_field`, `update_field`

**Comments** — `list_comments`, `create_comment`, `update_comment`, `delete_comment`

**Webhooks** — `create_webhook`, `list_webhooks`, `delete_webhook`, `list_webhook_payloads`, `refresh_webhook`, `manage_webhook_notifications`

**Attachments** — `upload_attachment`, `download_attachment`

**User** — `whoami`

The server ships a detailed `instructions` block so Claude picks the right tool and follows the correct sequence (resolve IDs → read/write) with minimal prompting.

### File size limit

Airtable's API accepts at most **5 MB** of file bytes per upload. Larger files can only be added through the Airtable UI. Airtable's alternative — having Airtable fetch a public URL — is deliberately **not** used here, because it would require staging the file in storage, which this server does not do.

---

## Setup & deploy

### Prerequisites
- Node.js 18+ and the Cloudflare **Wrangler** CLI, logged in (`wrangler login`).
- An **Airtable account**.

### 1. Install and deploy
```bash
npm install
npm run deploy
```
Note the URL, e.g. `https://airtable-mcp-server.<your-subdomain>.workers.dev`.

**Optional — custom domain.** If the domain is on your Cloudflare account, add a route to `wrangler.jsonc` and Wrangler creates the DNS record and certificate:
```jsonc
"routes": [{ "pattern": "airtable-mcp.example.com", "custom_domain": true }]
```
Defining `routes` disables the `*.workers.dev` URL unless you also set `"workers_dev": true`. Whichever hostname you settle on must match the OAuth redirect URL below.

### 2. Register an Airtable OAuth integration
Go to **https://airtable.com/create/oauth** → *Register new OAuth integration*.
- **OAuth redirect URL:** `https://<your-worker-host>/callback`
- **Scopes:** `data.records:read`, `data.records:write`, `data.recordComments:read`, `data.recordComments:write`, `schema.bases:read`, `schema.bases:write`, `webhook:manage`, `user.email:read`
- Copy the **Client ID**, then generate and copy the **Client secret** (shown once).

To let people other than yourself authorize it, Airtable also requires a **Privacy policy URL** and **Terms of service URL** on the integration.

### 3. Set secrets
```bash
npx wrangler secret put AIRTABLE_CLIENT_ID
npx wrangler secret put AIRTABLE_CLIENT_SECRET
npx wrangler secret put TOKEN_SEALING_KEY   # long random string, e.g. `openssl rand -hex 32`
```

### 4. Redeploy
```bash
npm run deploy
```

---

## Connecting

- **claude.ai** → Settings → Connectors → *Add custom connector* → paste `https://<your-worker-host>/mcp`
- **Claude Desktop** → Settings → Connectors → same URL
- **Claude Code** → `claude mcp add --transport http airtable https://<your-worker-host>/mcp`

Then sign in with Airtable when prompted.

## Local development
```bash
cp .dev.vars.example .dev.vars   # fill in secrets
npm run dev
```

## License
MIT
