import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env, Props } from "./types";
import { AirtableClient } from "./airtable";
import { registerAllTools } from "./tools";

const INSTRUCTIONS = [
  "This server exposes the full Airtable Web API for the authenticated user, plus document (attachment) upload and download. Every call acts as the signed-in Airtable account.",
  "",
  "RESOLVE IDS FIRST: call list_bases to turn a base name into its ID, then get_base_schema(baseId) for table IDs, field IDs, field types, and views. Operate on IDs, not names; pass returnFieldsByFieldId:true for rename-stable reads.",
  "",
  "READ records with list_records (filterByFormula, sort, view, field selection; paginate via the returned `offset`). For single/multi-select filters, read get_base_schema first to learn the choice names.",
  "",
  "WRITE records with create_records, update_records (PATCH — preserves unsent fields), replace_records (PUT — clears unsent fields), or delete_records. All auto-batch in groups of 10. To upsert, call update_records with performUpsert.fieldsToMergeOn.",
  "",
  "UPLOAD A DOCUMENT TO AIRTABLE (a main purpose of this server): call upload_attachment with the DESTINATION ONLY — baseId, recordId and the attachment field. It opens an in-chat file picker and the user's file is sent from their machine straight to Airtable. You never handle the bytes: there is no content parameter, and you must NOT reconstruct, retype or regenerate a document to upload it. If you cannot read the user's file, that is fine and expected — the picker does not need you to. Uploading a rebuilt lookalike instead of the real file is a serious error. Create the record first if it does not exist. Airtable caps files at 5 MB; larger ones must be added from the Airtable UI.",
  "",
  "UPLOADING WHEN YOU CAN READ THE USER'S FILES (Claude Code with folder access, or any host where you have a shell): use start_local_upload instead of the picker. It returns a ticket you spend with curl, so files go from disk straight to Airtable without their bytes entering the conversation — this is the efficient way to process a whole folder. Omit recordId to get one ticket covering many records, then send `-F recordId=...` per file. Always upload files that already exist on disk with `-F file=@<path>`; never generate a file and upload that. Use upload_attachment's picker only where you genuinely cannot read the user's files. If the upload cannot CONNECT at all (proxy 403, DNS failure, refused connection — not an HTTP status from this server), a sandbox egress allowlist is the cause: say so, hand the user the one-line sandbox.network.allowedDomains fix that start_local_upload prints, and use the picker for the current run. Never respond that uploading is impossible, and never quietly downgrade a folder import into per-file clicking without explaining why.",
  "",
  "DOWNLOAD A DOCUMENT FROM AIRTABLE: use download_attachment to get a fresh temporary URL (valid ~2h) plus metadata; in Claude Code, fetch that URL to save the file locally. Set inline:true to also receive base64 bytes for small files. Attachment URLs from list_records/get_record expire after ~2h — always fetch a fresh one.",
  "",
  "Also available: record comments, base/table/field schema management, and webhooks. Rate limits (5 req/sec/base) are retried automatically. ID prefixes: base app…, table tbl…, field fld…, record rec…, view viw…, comment com…, attachment att…, webhook ach…, workspace wsp….",
].join("\n");

/**
 * Build a server instance for a single request, bound to that caller's Airtable
 * credentials. Nothing is shared between requests or retained after one.
 */
/** Public origin, used to point MCP clients at the brand icons. */
const ORIGIN = "https://airtable-mcp.3nuggets.io";

/**
 * `requestOrigin` is the origin this request actually arrived on. It must be used
 * for the upload URL and the widget's CSP: a ticket minted here can only be
 * opened by the deployment holding this sealing key, so pointing the widget at a
 * hard-coded origin breaks uploads under `wrangler dev`, preview URLs, or any
 * second custom domain. The ORIGIN constant stays for the brand icons, which are
 * public assets that should always resolve to the canonical host.
 */
export function buildServer(env: Env, props: Props, requestOrigin: string): McpServer {
  const server = new McpServer(
    {
      name: "airtable-mcp-server",
      title: "Airtable",
      version: "2.0.0",
      websiteUrl: "https://3nuggets.io",
      description:
        "Read and write Airtable records, schema and comments, and upload or download documents — using your own Airtable account.",
      // Declares the connector's logo to MCP clients. The tile colour flips so the
      // mark reads against both light and dark chrome.
      icons: [
        { src: `${ORIGIN}/favicon.svg`, mimeType: "image/svg+xml", sizes: ["any"], theme: "light" },
        {
          src: `${ORIGIN}/icon-on-dark.svg`,
          mimeType: "image/svg+xml",
          sizes: ["any"],
          theme: "dark",
        },
        { src: `${ORIGIN}/icon-512.png`, mimeType: "image/png", sizes: ["512x512"] },
      ],
    },
    { instructions: INSTRUCTIONS },
  );

  const client = new AirtableClient(async () => {
    if (Date.now() >= props.expiresAt) {
      throw new Error("Airtable access token expired. Your client should refresh and retry.");
    }
    return props.airtableAccessToken;
  });

  registerAllTools(server, {
    env,
    userId: props.userId,
    client,
    origin: requestOrigin,
    accessToken: props.airtableAccessToken,
    accessTokenExpiresAt: props.expiresAt,
  });
  return server;
}
