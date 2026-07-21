import { z } from "zod";
import type { Query } from "../airtable";
import { encodePathSegment } from "../airtable";
import { run, chunk, type ToolRegistrar } from "./helpers";

const BATCH = 10;

const sortSchema = z
  .array(z.object({ field: z.string(), direction: z.enum(["asc", "desc"]).optional() }))
  .optional();

export const registerRecordTools: ToolRegistrar = (server, ctx) => {
  const { client } = ctx;

  server.tool(
    "list_records",
    "List records from a table. Supports filtering (filterByFormula), sorting, field selection, views, and pagination via `offset`. Returns { records, offset? }; re-call with the returned `offset` to page. Prefer table/field IDs over names for stability. Only requests one page (max 100) per call.",
    {
      baseId: z.string().describe("Base ID, e.g. appXXXXXXXXXXXXXX"),
      tableIdOrName: z.string().describe("Table ID (tbl...) or table name"),
      view: z.string().optional().describe("View ID or name to apply its filters/sort/field order"),
      fields: z.array(z.string()).optional().describe("Field names or IDs to return (omit for all)"),
      filterByFormula: z.string().optional().describe("Airtable formula, e.g. \"{Status}='Done'\""),
      sort: sortSchema.describe("Ordered sort keys"),
      maxRecords: z.number().int().positive().optional(),
      pageSize: z.number().int().min(1).max(100).optional().describe("Records per page, max 100"),
      offset: z.string().optional().describe("Pagination token from a previous response"),
      cellFormat: z.enum(["json", "string"]).optional().describe("'string' requires timeZone + userLocale"),
      timeZone: z.string().optional(),
      userLocale: z.string().optional(),
      returnFieldsByFieldId: z.boolean().optional().describe("Key cells by field ID instead of name"),
      recordMetadata: z.array(z.enum(["commentCount"])).optional(),
    },
    async (a) =>
      run(async () => {
        const query: Query = {
          view: a.view,
          filterByFormula: a.filterByFormula,
          maxRecords: a.maxRecords,
          pageSize: a.pageSize,
          offset: a.offset,
          cellFormat: a.cellFormat,
          timeZone: a.timeZone,
          userLocale: a.userLocale,
          returnFieldsByFieldId: a.returnFieldsByFieldId,
          fields: a.fields,
          recordMetadata: a.recordMetadata,
        };
        a.sort?.forEach((s, i) => {
          query[`sort[${i}][field]`] = s.field;
          if (s.direction) query[`sort[${i}][direction]`] = s.direction;
        });
        return client.get(`/v0/${a.baseId}/${encodePathSegment(a.tableIdOrName)}`, query);
      }),
  );

  server.tool(
    "get_record",
    "Fetch a single record by ID.",
    {
      baseId: z.string(),
      tableIdOrName: z.string(),
      recordId: z.string(),
      cellFormat: z.enum(["json", "string"]).optional(),
      returnFieldsByFieldId: z.boolean().optional(),
    },
    async (a) =>
      run(() =>
        client.get(`/v0/${a.baseId}/${encodePathSegment(a.tableIdOrName)}/${a.recordId}`, {
          cellFormat: a.cellFormat,
          returnFieldsByFieldId: a.returnFieldsByFieldId,
        }),
      ),
  );

  server.tool(
    "create_records",
    "Create one or more records. Each record is { fields: { FieldName: value } }. Automatically batched in groups of 10. Set typecast:true to coerce strings into the right cell type (and auto-create select options).",
    {
      baseId: z.string(),
      tableIdOrName: z.string(),
      records: z.array(z.object({ fields: z.record(z.string(), z.any()) })).min(1),
      typecast: z.boolean().optional(),
      returnFieldsByFieldId: z.boolean().optional(),
    },
    async (a) =>
      run(async () => {
        const path = `/v0/${a.baseId}/${encodePathSegment(a.tableIdOrName)}`;
        const created: any[] = [];
        for (const group of chunk(a.records, BATCH)) {
          const res: any = await client.post(path, {
            records: group,
            typecast: a.typecast,
            returnFieldsByFieldId: a.returnFieldsByFieldId,
          });
          created.push(...(res.records ?? []));
        }
        return { records: created };
      }),
  );

  server.tool(
    "update_records",
    "Update records (PATCH — only the fields you send change; others are preserved). Each record needs its `id`. Automatically batched in groups of 10. For UPSERT, omit `id` on records and pass `performUpsert.fieldsToMergeOn` (1–3 fields used as a key): unmatched rows are created, single matches updated (>1 match fails the request).",
    {
      baseId: z.string(),
      tableIdOrName: z.string(),
      records: z
        .array(z.object({ id: z.string().optional(), fields: z.record(z.string(), z.any()) }))
        .min(1),
      typecast: z.boolean().optional(),
      performUpsert: z.object({ fieldsToMergeOn: z.array(z.string()).min(1).max(3) }).optional(),
      returnFieldsByFieldId: z.boolean().optional(),
    },
    async (a) =>
      run(() => updateRecords(ctx, "PATCH", a)),
  );

  server.tool(
    "replace_records",
    "Replace records (PUT — DESTRUCTIVE: any field you do not send is cleared). Each record needs its `id`. Automatically batched in groups of 10. Prefer update_records unless you truly want to wipe unspecified fields.",
    {
      baseId: z.string(),
      tableIdOrName: z.string(),
      records: z
        .array(z.object({ id: z.string().optional(), fields: z.record(z.string(), z.any()) }))
        .min(1),
      typecast: z.boolean().optional(),
      performUpsert: z.object({ fieldsToMergeOn: z.array(z.string()).min(1).max(3) }).optional(),
      returnFieldsByFieldId: z.boolean().optional(),
    },
    async (a) =>
      run(() => updateRecords(ctx, "PUT", a)),
  );

  server.tool(
    "delete_records",
    "Delete records by ID. Automatically batched in groups of 10.",
    {
      baseId: z.string(),
      tableIdOrName: z.string(),
      recordIds: z.array(z.string()).min(1),
    },
    async (a) =>
      run(async () => {
        const path = `/v0/${a.baseId}/${encodePathSegment(a.tableIdOrName)}`;
        const deleted: any[] = [];
        for (const group of chunk(a.recordIds, BATCH)) {
          const res: any = await client.delete(path, { records: group });
          deleted.push(...(res.records ?? []));
        }
        return { records: deleted };
      }),
  );
};

async function updateRecords(
  ctx: { client: import("../airtable").AirtableClient },
  method: "PATCH" | "PUT",
  a: {
    baseId: string;
    tableIdOrName: string;
    records: { id?: string; fields: Record<string, any> }[];
    typecast?: boolean;
    performUpsert?: { fieldsToMergeOn: string[] };
    returnFieldsByFieldId?: boolean;
  },
) {
  const path = `/v0/${a.baseId}/${encodePathSegment(a.tableIdOrName)}`;
  const records: any[] = [];
  const createdRecords: string[] = [];
  const updatedRecords: string[] = [];
  for (const group of chunk(a.records, 10)) {
    const body: any = {
      records: group,
      typecast: a.typecast,
      returnFieldsByFieldId: a.returnFieldsByFieldId,
    };
    if (a.performUpsert) body.performUpsert = a.performUpsert;
    const res: any =
      method === "PATCH" ? await ctx.client.patch(path, body) : await ctx.client.put(path, body);
    records.push(...(res.records ?? []));
    if (res.createdRecords) createdRecords.push(...res.createdRecords);
    if (res.updatedRecords) updatedRecords.push(...res.updatedRecords);
  }
  const out: any = { records };
  if (a.performUpsert) {
    out.createdRecords = createdRecords;
    out.updatedRecords = updatedRecords;
  }
  return out;
}
