import { z } from "zod";
import { run, type ToolRegistrar } from "./helpers";
import { attachStagedFile, downloadAttachment, stageContent, createUploadSlot } from "../attachments";

export const registerAttachmentTools: ToolRegistrar = (server, ctx) => {
  const { client, env } = ctx;

  server.tool(
    "upload_attachment",
    [
      "Attach a file to a record's attachment field. THE FILE IS UPLOADED VIA A TEMPORARY CLOUDFLARE URL AND DELETED AFTER AIRTABLE INGESTS IT.",
      "",
      "Provide the file EITHER as `content` (base64) OR as `uploadKey`:",
      "- `content`: base64-encoded bytes, inline. Best for smaller files that fit in the conversation.",
      "- `uploadKey`: the key returned by `create_attachment_upload_url` after you stream the bytes to its `uploadUrl` (best for large files, e.g. from Claude Code: `curl -X PUT --data-binary @file <uploadUrl>`).",
      "",
      "The record must already exist. By default the file is APPENDED to any existing attachments; set overwrite:true to replace them. Returns the ingested Airtable attachment (id, url, size, type) once re-hosting completes.",
    ].join("\n"),
    {
      baseId: z.string(),
      tableIdOrName: z.string(),
      recordId: z.string().describe("Existing record to attach to"),
      attachmentField: z.string().describe("Attachment field name or ID (fld...)"),
      filename: z.string().describe("Filename to store in Airtable, e.g. report.pdf"),
      contentType: z.string().describe("MIME type, e.g. application/pdf"),
      content: z.string().optional().describe("Base64-encoded file bytes (use this OR uploadKey)"),
      uploadKey: z.string().optional().describe("Key from create_attachment_upload_url (use this OR content)"),
      overwrite: z.boolean().optional().describe("Replace existing attachments instead of appending"),
    },
    async (a) =>
      run(async () => {
        if (!a.content && !a.uploadKey) {
          throw new Error("Provide either `content` (base64) or `uploadKey`.");
        }
        const key = a.content
          ? await stageContent(env, a.filename, a.contentType, a.content)
          : a.uploadKey!;
        return attachStagedFile(client, env, {
          baseId: a.baseId,
          tableIdOrName: a.tableIdOrName,
          recordId: a.recordId,
          attachmentField: a.attachmentField,
          filename: a.filename,
          key,
          overwrite: a.overwrite,
        });
      }),
  );

  server.tool(
    "create_attachment_upload_url",
    [
      "Get a temporary signed URL to stream a large file into staging (Cloudflare R2), then attach it with `upload_attachment` using the returned `uploadKey`.",
      "Use this for files too large to pass inline as base64 (any size, capped only by Airtable's attachment limits).",
      "Workflow: 1) call this with the filename → get { uploadKey, uploadUrl }. 2) PUT the raw file bytes to uploadUrl (e.g. `curl -X PUT --data-binary @/path/file <uploadUrl>`). 3) call upload_attachment with the same uploadKey.",
    ].join("\n"),
    {
      filename: z.string().describe("Filename to store in Airtable"),
    },
    async (a) => run(() => createUploadSlot(env, a.filename)),
  );

  server.tool(
    "download_attachment",
    [
      "Read an attachment from a record and return a fresh, temporary download URL (valid ~2 hours) plus metadata (filename, size, type).",
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
