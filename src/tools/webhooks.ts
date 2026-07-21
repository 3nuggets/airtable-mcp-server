import { z } from "zod";
import { run, type ToolRegistrar } from "./helpers";

export const registerWebhookTools: ToolRegistrar = (server, ctx) => {
  const { client } = ctx;
  const base = (baseId: string) => `/v0/bases/${baseId}/webhooks`;

  server.tool(
    "create_webhook",
    "Create a webhook on a base. Airtable POSTs a lightweight ping to notificationUrl on changes; call list_webhook_payloads to pull the actual changes. `specification.options.filters.dataTypes` is required (tableData | tableFields | tableMetadata). Save the returned macSecretBase64 to verify incoming pings.",
    {
      baseId: z.string(),
      notificationUrl: z.string().url().optional().describe("HTTPS URL Airtable pings; omit for a poll-only webhook"),
      specification: z.record(z.string(), z.any()).describe("{ options: { filters: {...}, includes?: {...} } }"),
    },
    async (a) =>
      run(() =>
        client.post(base(a.baseId), {
          notificationUrl: a.notificationUrl,
          specification: a.specification,
        }),
      ),
  );

  server.tool(
    "list_webhooks",
    "List all webhooks on a base.",
    { baseId: z.string() },
    async (a) => run(() => client.get(base(a.baseId))),
  );

  server.tool(
    "delete_webhook",
    "Delete a webhook.",
    { baseId: z.string(), webhookId: z.string() },
    async (a) => run(() => client.delete(`${base(a.baseId)}/${a.webhookId}`)),
  );

  server.tool(
    "list_webhook_payloads",
    "Fetch the change payloads a webhook has recorded. Loop while `mightHaveMore` is true, passing the returned `cursor`. Calling this also extends the webhook's expiration to 7 days.",
    {
      baseId: z.string(),
      webhookId: z.string(),
      cursor: z.number().int().optional().describe("Defaults to 1 on the first call"),
      limit: z.number().int().min(1).max(50).optional(),
    },
    async (a) =>
      run(() =>
        client.get(`${base(a.baseId)}/${a.webhookId}/payloads`, { cursor: a.cursor, limit: a.limit }),
      ),
  );

  server.tool(
    "refresh_webhook",
    "Extend a webhook's expiration (webhooks with a notificationUrl expire after 7 days of inactivity).",
    { baseId: z.string(), webhookId: z.string() },
    async (a) => run(() => client.post(`${base(a.baseId)}/${a.webhookId}/refresh`, {})),
  );

  server.tool(
    "manage_webhook_notifications",
    "Enable or disable the notification pings for a webhook.",
    { baseId: z.string(), webhookId: z.string(), enable: z.boolean() },
    async (a) =>
      run(() =>
        client.post(`${base(a.baseId)}/${a.webhookId}/enableNotifications`, { enable: a.enable }),
      ),
  );
};
