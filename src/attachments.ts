import { AirtableClient, AIRTABLE_CONTENT, encodePathSegment } from "./airtable";

/**
 * Attachment handling with zero persistence. Uploaded bytes are passed straight
 * from the request to Airtable's upload endpoint and then dropped; downloads hand
 * back Airtable's own temporary URL. Nothing touches our storage at any point.
 */

/** Airtable's limit for uploading file bytes directly. */
export const MAX_DIRECT_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Max bytes we will inline as base64 in a tool result. */
const MAX_INLINE_BYTES = 8 * 1024 * 1024;

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

/** Byte length of a base64 payload without allocating the decoded buffer. */
export function base64ByteLength(base64: string): number {
  const clean = base64.replace(/\s/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
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

function formatBytes(n: number): string {
  return n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;
}

/**
 * Upload a document into a record's attachment field by streaming the bytes
 * through to Airtable's upload endpoint.
 */
export async function uploadAttachment(
  client: AirtableClient,
  args: {
    baseId: string;
    recordId: string;
    attachmentField: string;
    filename: string;
    contentType: string;
    content: string;
  },
): Promise<unknown> {
  const size = base64ByteLength(args.content);
  if (size > MAX_DIRECT_UPLOAD_BYTES) {
    throw new Error(
      `File is ${formatBytes(size)}, over Airtable's ${formatBytes(MAX_DIRECT_UPLOAD_BYTES)} limit ` +
        `for uploading file bytes. Airtable cannot accept a larger file through this API, so it ` +
        `must be added from the Airtable UI instead.`,
    );
  }

  // The only endpoint on content.airtable.com. Appends to the attachment cell.
  const path = `/v0/${args.baseId}/${args.recordId}/${encodePathSegment(args.attachmentField)}/uploadAttachment`;
  return client.post(
    path,
    { contentType: args.contentType, file: args.content, filename: args.filename },
    { host: AIRTABLE_CONTENT },
  );
}

/**
 * Read an attachment from a record: returns Airtable's own temporary URL (~2h)
 * plus metadata, optionally with the bytes inlined for small files.
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
  const path = `/v0/${args.baseId}/${encodePathSegment(args.tableIdOrName)}/${args.recordId}`;
  const record: any = await client.get(path, { returnFieldsByFieldId: byId });

  const value = record?.fields?.[args.attachmentField];
  const attachments: AirtableAttachment[] = Array.isArray(value) ? value : [];
  if (attachments.length === 0) throw new Error("No attachments in that field on that record.");

  const chosen = args.attachmentId
    ? attachments.find((a) => a.id === args.attachmentId)
    : attachments[args.index ?? 0];
  if (!chosen) throw new Error("Requested attachment not found.");

  const out: {
    filename?: string;
    size?: number;
    type?: string;
    url?: string;
    contentBase64?: string;
  } = {
    filename: chosen.filename,
    size: chosen.size,
    type: chosen.type,
    url: chosen.url,
  };

  if (args.inline && chosen.url) {
    if ((chosen.size ?? 0) > MAX_INLINE_BYTES) {
      throw new Error(
        `File is ${formatBytes(chosen.size ?? 0)} — too large to inline. Use the returned url to download it (valid ~2h).`,
      );
    }
    const res = await fetch(chosen.url);
    if (!res.ok) throw new Error(`Failed to download attachment bytes (${res.status}).`);
    out.contentBase64 = bytesToBase64(await res.arrayBuffer());
  }
  return out;
}
