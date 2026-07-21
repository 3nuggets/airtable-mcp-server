import { z } from "zod";
import { encodePathSegment } from "../airtable";
import { run, type ToolRegistrar } from "./helpers";

export const registerCommentTools: ToolRegistrar = (server, ctx) => {
  const { client } = ctx;
  const base = (a: { baseId: string; tableIdOrName: string; recordId: string }) =>
    `/v0/${a.baseId}/${encodePathSegment(a.tableIdOrName)}/${a.recordId}/comments`;

  server.tool(
    "list_comments",
    "List comments on a record (newest first). Paginate with `offset`.",
    {
      baseId: z.string(),
      tableIdOrName: z.string(),
      recordId: z.string(),
      pageSize: z.number().int().min(1).max(100).optional(),
      offset: z.string().optional(),
    },
    async (a) => run(() => client.get(base(a), { pageSize: a.pageSize, offset: a.offset })),
  );

  server.tool(
    "create_comment",
    "Add a comment to a record. Mention a user with @[usrXXXXXXXXXXXXXX]. Set parentCommentId to reply in a thread.",
    {
      baseId: z.string(),
      tableIdOrName: z.string(),
      recordId: z.string(),
      text: z.string(),
      parentCommentId: z.string().optional(),
    },
    async (a) =>
      run(() => client.post(base(a), { text: a.text, parentCommentId: a.parentCommentId })),
  );

  server.tool(
    "update_comment",
    "Edit an existing comment's text.",
    {
      baseId: z.string(),
      tableIdOrName: z.string(),
      recordId: z.string(),
      commentId: z.string(),
      text: z.string(),
    },
    async (a) => run(() => client.patch(`${base(a)}/${a.commentId}`, { text: a.text })),
  );

  server.tool(
    "delete_comment",
    "Delete a comment from a record.",
    {
      baseId: z.string(),
      tableIdOrName: z.string(),
      recordId: z.string(),
      commentId: z.string(),
    },
    async (a) => run(() => client.delete(`${base(a)}/${a.commentId}`)),
  );
};
