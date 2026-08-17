import { z } from "zod";
import { run, type ToolRegistrar } from "./helpers";
import { uploadAttachment, downloadAttachment } from "../attachments";

export const registerAttachmentTools: ToolRegistrar = (server, ctx) => {
  const { client } = ctx;

  server.tool(
    "upload_attachment",
    [
      "Upload a document from the user's computer into a record's attachment field.",
      "",
      "Pass the file bytes as base64 in `content`. The bytes are streamed straight through to Airtable and are never stored by this server.",
      "The record must already exist — create it first if needed. The file is APPENDED to any attachments already in the field.",
      "",
      "LIMIT: Airtable accepts at most 5 MB of file bytes through its API. If a file is larger, report that clearly to the user instead of retrying — it must be added through the Airtable UI.",
    ].join("\n"),
    {
      baseId: z.string(),
      recordId: z.string().describe("Existing record to attach to"),
      attachmentField: z.string().describe("Attachment field name or ID (fld...)"),
      filename: z.string().describe("Filename to store in Airtable, e.g. report.pdf"),
      contentType: z.string().describe("MIME type, e.g. application/pdf"),
      content: z.string().describe("Base64-encoded file bytes (max 5 MB decoded)"),
    },
    async (a) =>
      run(() =>
        uploadAttachment(client, {
          baseId: a.baseId,
          recordId: a.recordId,
          attachmentField: a.attachmentField,
          filename: a.filename,
          contentType: a.contentType,
          content: a.content,
        }),
      ),
  );

  server.tool(
    "download_attachment",
    [
      "Read an attachment from a record and return a fresh temporary download URL (valid ~2 hours) plus metadata (filename, size, type).",
      "In Claude Code you can fetch that URL to save the file locally (e.g. `curl -o file <url>`).",
      "Set inline:true to also receive the file bytes as base64 in the result (small files only).",
      "Select which attachment with `attachmentId` (att...), otherwise `index` is used (default 0, the first).",
    ].join("\n"),
    {
      baseId: z.string(),
      tableIdOrName: z.string(),
      recordId: z.string(),
      attachmentField: z.string().describe("Attachment field name or ID"),
      attachmentId: z.string().optional(),
      index: z.number().int().min(0).optional(),
      inline: z.boolean().optional().describe("Also return base64 bytes (small files)"),
    },
    async (a) =>
      run(() =>
        downloadAttachment(client, {
          baseId: a.baseId,
          tableIdOrName: a.tableIdOrName,
          recordId: a.recordId,
          attachmentField: a.attachmentField,
          attachmentId: a.attachmentId,
          index: a.index,
          inline: a.inline,
        }),
      ),
  );
};
