import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env, Props, StoredTokens } from "./types";
import { AirtableClient } from "./airtable";
import { getValidAccessToken } from "./tokens";
import { registerAllTools } from "./tools";

const INSTRUCTIONS = [
  "This server exposes the full Airtable Web API for the authenticated user, plus first-class document (attachment) upload and download. Every call acts as the signed-in Airtable account.",
  "",
  "RESOLVE IDS FIRST: call list_bases to turn a base name into its ID, then get_base_schema(baseId) for table IDs, field IDs, field types, and views. Operate on IDs, not names; pass returnFieldsByFieldId:true for rename-stable reads.",
  "",
  "READ records with list_records (filterByFormula, sort, view, field selection; paginate via the returned `offset`). For single/multi-select filters, read get_base_schema first to learn the choice names.",
  "",
  "WRITE records with create_records, update_records (PATCH — preserves unsent fields), replace_records (PUT — clears unsent fields), or delete_records. All auto-batch in groups of 10. To upsert, call update_records with performUpsert.fieldsToMergeOn.",
  "",
  "UPLOAD A DOCUMENT TO AIRTABLE (the main purpose of this server): use upload_attachment on an existing record's attachment field. Pass small/medium files inline as base64 `content`. For large files (or from Claude Code), call create_attachment_upload_url, PUT the raw bytes to the returned uploadUrl, then call upload_attachment with the returned uploadKey. The server stages the file on Cloudflare, gives Airtable a temporary URL, waits for Airtable to re-host it, then deletes the staged copy — you never manage storage. Create the record first if it does not exist.",
  "",
  "DOWNLOAD A DOCUMENT FROM AIRTABLE: use download_attachment to get a fresh temporary URL (valid ~2h) plus metadata; in Claude Code, fetch that URL to save the file locally. Set inline:true to also receive base64 bytes for small files. Attachment URLs from list_records/get_record expire after ~2h — always fetch a fresh one.",
  "",
  "Also available: record comments, base/table/field schema management, and webhooks. Rate limits (5 req/sec/base) are retried automatically. ID prefixes: base app…, table tbl…, field fld…, record rec…, view viw…, comment com…, attachment att…, webhook ach…, workspace wsp….",
].join("\n");

export class AirtableMCP extends McpAgent<Env, unknown, Props> {
  server = new McpServer(
    { name: "airtable-mcp-server", version: "1.0.0" },
    { instructions: INSTRUCTIONS },
  );

  async init(): Promise<void> {
    const env = this.env;
    const props = this.props;
    if (!props?.userId) {
      throw new Error("Missing authentication context. Please reconnect the Airtable connector.");
    }
    const fallback: StoredTokens = {
      accessToken: props.airtableAccessToken,
      refreshToken: props.airtableRefreshToken,
      expiresAt: props.expiresAt,
      scope: props.scope,
    };
    const client = new AirtableClient(() => getValidAccessToken(env, props.userId, fallback));
    registerAllTools(this.server, { env, userId: props.userId, client });
  }
}
