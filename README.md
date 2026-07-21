# Airtable MCP Server

A remote [Model Context Protocol](https://modelcontextprotocol.io) server that exposes the **full Airtable Web API** to Claude — including **document (attachment) upload and download**, which the official Airtable connector does not support.

It runs on **Cloudflare Workers**, authenticates each user with **their own Airtable account** via OAuth 2.1 (PKCE-S256), and stages file uploads through **Cloudflare R2** so files of any size can be attached to Airtable and then removed from Cloudflare automatically.

Works as a **claude.ai custom connector**, in **Claude Desktop**, and in **Claude Code**.

---

## Why this exists

Uploading a file from your computer into an Airtable attachment field — and pulling files back out — without you having to think about hosting, URLs, or cleanup. You point Claude at a record; Claude uploads the document; the server handles staging, ingestion, and teardown.

## How document upload works

Airtable ingests attachments from a **publicly reachable URL**, which it then re-hosts on its own storage. This server automates that safely, supporting files up to **Airtable's 5 GB per-file limit**:

1. The file is staged in a private **R2** bucket — small files inline as base64, large files streamed straight to R2 via a **presigned PUT URL** (bytes never pass through the Worker, so there's no ~100 MB request-body ceiling).
2. The server hands Airtable a **short-lived presigned GET URL** for the staged object.
3. Airtable fetches and re-hosts the file.
4. The server **polls the record** until Airtable's re-hosted copy appears, then **deletes the staged file from R2**.

Presigned URLs are generated with an R2 S3 API token; the bucket itself stays private.

## Architecture

| Piece | What it does |
|---|---|
| `McpAgent` (Durable Object) | Hosts the MCP server + tools, one instance per user session |
| `@cloudflare/workers-oauth-provider` | Makes the Worker an OAuth 2.1 server for MCP clients (claude.ai does dynamic client registration) |
| Airtable OAuth (upstream) | Each user signs in with their own Airtable account; tokens stored in KV, auto-refreshed (with rotation) |
| R2 bucket | Temporary staging for attachment bytes |
| Presigned R2 URLs | Client PUTs large files straight to R2; Airtable GETs the staged file to ingest — bytes bypass the Worker |

Transport: **Streamable HTTP** at `/mcp` (plus legacy `/sse`).

---

## Tools

**Records** — `list_records`, `get_record`, `create_records`, `update_records` (PATCH + upsert), `replace_records` (PUT), `delete_records` *(create/update/delete auto-batch in groups of 10)*

**Schema** — `list_bases`, `get_base_schema`, `create_base`, `create_table`, `update_table`, `create_field`, `update_field`

**Comments** — `list_comments`, `create_comment`, `update_comment`, `delete_comment`

**Webhooks** — `create_webhook`, `list_webhooks`, `delete_webhook`, `list_webhook_payloads`, `refresh_webhook`, `manage_webhook_notifications`

**Attachments** — `upload_attachment`, `create_attachment_upload_url`, `download_attachment`

**User** — `whoami`

The server ships a detailed `instructions` block so Claude picks the right tool and follows the correct sequence (resolve IDs → read/write; stage → attach → cleanup) with minimal prompting.

---

## Setup & deploy

### Prerequisites
- Node.js 18+ and the Cloudflare **Wrangler** CLI (`npm i -g wrangler` or use `npx`), logged in (`wrangler login`).
- **R2 enabled** on your Cloudflare account (Dashboard → R2 → enable). Required before deploy.
- An **Airtable account**.

### 1. Install
```bash
npm install
npm run cf-typegen   # generates worker-configuration.d.ts
```

### 2. Create resources
```bash
npx wrangler kv namespace create airtable-mcp-server-OAUTH_KV   # put the id in wrangler.jsonc
npx wrangler r2 bucket create airtable-mcp-files
```

### 3. First deploy (to get your Worker URL)
```bash
npm run deploy
```
Note the URL, e.g. `https://airtable-mcp-server.<your-subdomain>.workers.dev`.

### 4. Register an Airtable OAuth integration
Go to **https://airtable.com/create/oauth** → *Register new OAuth integration*.
- **Name:** anything (e.g. "My Airtable MCP").
- **OAuth redirect URL:** `https://airtable-mcp-server.<your-subdomain>.workers.dev/callback`
- **Scopes** (must match the server): `data.records:read`, `data.records:write`, `data.recordComments:read`, `data.recordComments:write`, `schema.bases:read`, `schema.bases:write`, `webhook:manage`, `user.email:read`.
- Copy the **Client ID**, then generate and copy the **Client secret** (shown once).

### 5. Create an R2 S3 API token
Cloudflare dashboard → **R2** → **Manage API Tokens** → **Create API Token** (Object Read & Write). Copy the **Access Key ID** and **Secret Access Key**.

### 6. Set secrets
```bash
npx wrangler secret put AIRTABLE_CLIENT_ID
npx wrangler secret put AIRTABLE_CLIENT_SECRET
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
```
`R2_ACCOUNT_ID` is already set as a var in `wrangler.jsonc`.

### 7. Redeploy
```bash
npm run deploy
```

---

## Connecting

- **claude.ai** → Settings → Connectors → *Add custom connector* → paste `https://<your-worker>/mcp`. Sign in with Airtable when prompted.
- **Claude Desktop** → Settings → Connectors → add the same `/mcp` URL.
- **Claude Code** → `claude mcp add --transport http airtable https://<your-worker>/mcp`

> **Large files:** truly unlimited uploads work best from **Claude Code**, which can stream bytes to the signed upload URL. From claude.ai/Desktop, files pass through the conversation and are bounded by context size.

## Local development
```bash
cp .dev.vars.example .dev.vars   # fill in secrets
npm run dev
```

## License
MIT
