import type { Env } from "./types";
import { AirtableClient, encodePathSegment } from "./airtable";
import { makeKey, presignGet, presignPut, putObject, headObject, deleteObject } from "./r2files";

/** How long the presigned URL stays valid for Airtable's async ingestion (seconds). */
const STAGED_URL_TTL = 2 * 60 * 60;
/** Ingestion polling. */
const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 60_000;
/** Max bytes we will inline as base64 in a tool result. */
const MAX_INLINE_BYTES = 8 * 1024 * 1024;
/** Airtable's maximum attachment size: 5 GB per file. This is our hard threshold. */
export const MAX_ATTACHMENT_BYTES = 5_000_000_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface AirtableAttachment {
  id?: string;
  url?: string;
  filename?: string;
  size?: number;
  type?: string;
  width?: number;
  height?: number;
  thumbnails?: unknown;
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Decode base64 content into R2 and return the staged key. */
export async function stageContent(
  env: Env,
  filename: string,
  contentType: string,
  base64: string,
): Promise<string> {
  const key = makeKey(filename);
  const bytes = base64ToBytes(base64);
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`File is ${bytes.length} bytes, over Airtable's 5 GB attachment limit.`);
  }
  await putObject(env, key, bytes, contentType);
  return key;
}

/** Presign a PUT URL for a fresh key so a client can stream bytes straight into R2. */
export async function createUploadSlot(
  env: Env,
  filename: string,
): Promise<{ key: string; uploadUrl: string; expiresInSeconds: number }> {
  const key = makeKey(filename);
  const uploadUrl = await presignPut(env, key, STAGED_URL_TTL);
  return { key, uploadUrl, expiresInSeconds: STAGED_URL_TTL };
}

function recordPath(baseId: string, tableIdOrName: string, recordId: string): string {
  return `/v0/${baseId}/${encodePathSegment(tableIdOrName)}/${recordId}`;
}

function readAttachments(record: any, field: string): AirtableAttachment[] {
  const value = record?.fields?.[field];
  return Array.isArray(value) ? (value as AirtableAttachment[]) : [];
}

/**
 * Attach a file that is already staged in R2 (via `stageContent` or a presigned PUT)
 * to a record's attachment field, by handing Airtable a temporary signed URL. Waits
 * for Airtable to re-host the file, then deletes the staged R2 object.
 */
export async function attachStagedFile(
  client: AirtableClient,
  env: Env,
  args: {
    baseId: string;
    tableIdOrName: string;
    recordId: string;
    attachmentField: string;
    filename: string;
    key: string;
    overwrite?: boolean;
  },
): Promise<{ attachment: AirtableAttachment | null; note?: string }> {
  const { baseId, tableIdOrName, recordId, attachmentField, filename, key } = args;
  const byId = /^fld/.test(attachmentField);

  // Confirm the staged object exists and is within Airtable's size limit.
  const head = await headObject(env, key);
  if (!head) {
    throw new Error(
      "Staged file not found in R2. If you used create_attachment_upload_url, make sure the PUT to uploadUrl completed successfully.",
    );
  }
  if (head.size > MAX_ATTACHMENT_BYTES) {
    await deleteObject(env, key);
    throw new Error(`File is ${head.size} bytes, over Airtable's 5 GB attachment limit.`);
  }

  const fileUrl = await presignGet(env, key, STAGED_URL_TTL);
  const path = recordPath(baseId, tableIdOrName, recordId);

  // Snapshot existing attachments so we can (a) append and (b) detect the new one.
  const before: any = await client.get(path, { returnFieldsByFieldId: byId });
  const existing = readAttachments(before, attachmentField);
  const existingIds = new Set(existing.map((a) => a.id).filter(Boolean));

  const newValue = args.overwrite
    ? [{ url: fileUrl, filename }]
    : [...existing.map((a) => ({ id: a.id })), { url: fileUrl, filename }];

  await client.patch(`/v0/${baseId}/${encodePathSegment(tableIdOrName)}`, {
    records: [{ id: recordId, fields: { [attachmentField]: newValue } }],
    returnFieldsByFieldId: byId,
  });

  // Poll until Airtable has re-hosted the file on airtableusercontent.com.
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let ingested: AirtableAttachment | null = null;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const rec: any = await client.get(path, { returnFieldsByFieldId: byId });
    const now = readAttachments(rec, attachmentField);
    const fresh = now.find(
      (a) =>
        a.id &&
        !existingIds.has(a.id) &&
        typeof a.url === "string" &&
        a.url.includes("airtableusercontent.com") &&
        typeof a.size === "number",
    );
    if (fresh) {
      ingested = fresh;
      break;
    }
  }

  if (ingested) {
    await deleteObject(env, key);
    return { attachment: ingested };
  }
  // Not confirmed in time — leave the staged object so Airtable's async fetch can
  // still complete within STAGED_URL_TTL. Report it as in-progress.
  return {
    attachment: null,
    note: "Upload submitted; Airtable was still processing it when polling timed out. It should appear on the record shortly. The staged file remains available to Airtable until its temporary URL expires.",
  };
}

/**
 * Read a record's attachment field and return a downloadable URL (fresh, ~2h) plus
 * metadata. Optionally inline the bytes as base64 for small files.
 */
export async function downloadAttachment(
  client: AirtableClient,
  args: {
    baseId: string;
    tableIdOrName: string;
    recordId: string;
    attachmentField: string;
    attachmentId?: string;
    index?: number;
    inline?: boolean;
  },
): Promise<{
  filename?: string;
  size?: number;
  type?: string;
  url?: string;
  contentBase64?: string;
}> {
  const byId = /^fld/.test(args.attachmentField);
  const path = recordPath(args.baseId, args.tableIdOrName, args.recordId);
  const rec: any = await client.get(path, { returnFieldsByFieldId: byId });
  const attachments = readAttachments(rec, args.attachmentField);
  if (attachments.length === 0) throw new Error("No attachments in that field on that record.");

  const chosen = args.attachmentId
    ? attachments.find((a) => a.id === args.attachmentId)
    : attachments[args.index ?? 0];
  if (!chosen) throw new Error("Requested attachment not found.");

  const out = {
    filename: chosen.filename,
    size: chosen.size,
    type: chosen.type,
    url: chosen.url,
  } as { filename?: string; size?: number; type?: string; url?: string; contentBase64?: string };

  if (args.inline && chosen.url) {
    if ((chosen.size ?? 0) > MAX_INLINE_BYTES) {
      throw new Error(
        `File is ${chosen.size} bytes — too large to inline. Use the returned url to download it (valid ~2h).`,
      );
    }
    const res = await fetch(chosen.url);
    if (!res.ok) throw new Error(`Failed to download attachment bytes (${res.status}).`);
    out.contentBase64 = bytesToBase64(await res.arrayBuffer());
  }
  return out;
}
