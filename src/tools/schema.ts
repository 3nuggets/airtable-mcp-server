import { z } from "zod";
import { run, type ToolRegistrar } from "./helpers";

export const registerSchemaTools: ToolRegistrar = (server, ctx) => {
  const { client } = ctx;

  server.tool(
    "list_bases",
    "List all bases the user can access, with id, name, and permissionLevel. Paginate with `offset`. Start here to resolve a base name to its ID.",
    { offset: z.string().optional() },
    async (a) => run(() => client.get(`/v0/meta/bases`, { offset: a.offset })),
  );

  server.tool(
    "get_base_schema",
    "Get the full schema of a base: every table with its fields (id, name, type, options) and views. Call this before reading/writing so you can use field IDs and understand field types (especially select options, which need choice IDs when filtering).",
    {
      baseId: z.string(),
      include: z.array(z.enum(["visibleFieldIds"])).optional(),
    },
    async (a) => run(() => client.get(`/v0/meta/bases/${a.baseId}/tables`, { include: a.include })),
  );

  server.tool(
    "create_base",
    "Create a new base in a workspace. `tables` is an array of table specs; the first field in each table's `fields` array becomes the primary field.",
    {
      name: z.string(),
      workspaceId: z.string().describe("Workspace ID, e.g. wspXXXXXXXXXXXXXX"),
      tables: z.array(z.record(z.string(), z.any())).describe("Array of { name, fields, description? }"),
    },
    async (a) =>
      run(() => client.post(`/v0/meta/bases`, { name: a.name, workspaceId: a.workspaceId, tables: a.tables })),
  );

  server.tool(
    "create_table",
    "Create a table in a base. `fields` is an array of { name, type, options? }; the first is the primary field.",
    {
      baseId: z.string(),
      name: z.string(),
      description: z.string().optional(),
      fields: z.array(z.record(z.string(), z.any())),
    },
    async (a) =>
      run(() =>
        client.post(`/v0/meta/bases/${a.baseId}/tables`, {
          name: a.name,
          description: a.description,
          fields: a.fields,
        }),
      ),
  );

  server.tool(
    "update_table",
    "Update a table's name and/or description.",
    {
      baseId: z.string(),
      tableId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
    },
    async (a) =>
      run(() =>
        client.patch(`/v0/meta/bases/${a.baseId}/tables/${a.tableId}`, {
          name: a.name,
          description: a.description,
        }),
      ),
  );

  server.tool(
    "create_field",
    "Create a field in a table. `type` is an Airtable field type (e.g. singleLineText, multilineText, number, singleSelect, multipleSelects, multipleAttachments, checkbox, date, formula, multipleRecordLinks). `options` shape depends on the type — check get_base_schema for examples.",
    {
      baseId: z.string(),
      tableId: z.string(),
      name: z.string(),
      type: z.string(),
      description: z.string().optional(),
      options: z.record(z.string(), z.any()).optional(),
    },
    async (a) =>
      run(() =>
        client.post(`/v0/meta/bases/${a.baseId}/tables/${a.tableId}/fields`, {
          name: a.name,
          type: a.type,
          description: a.description,
          options: a.options,
        }),
      ),
  );

  server.tool(
    "update_field",
    "Update a field's name and/or description (field type cannot be changed via the API).",
    {
      baseId: z.string(),
      tableId: z.string(),
      fieldId: z.string(),
      name: z.string().optional(),
      description: z.string().optional(),
    },
    async (a) =>
      run(() =>
        client.patch(`/v0/meta/bases/${a.baseId}/tables/${a.tableId}/fields/${a.fieldId}`, {
          name: a.name,
          description: a.description,
        }),
      ),
  );
};
