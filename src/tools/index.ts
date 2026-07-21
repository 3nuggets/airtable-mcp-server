import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolContext } from "./helpers";
import { registerRecordTools } from "./records";
import { registerSchemaTools } from "./schema";
import { registerCommentTools } from "./comments";
import { registerWebhookTools } from "./webhooks";
import { registerAttachmentTools } from "./attachments";
import { registerUserTools } from "./user";

export function registerAllTools(server: McpServer, ctx: ToolContext): void {
  registerUserTools(server, ctx);
  registerSchemaTools(server, ctx);
  registerRecordTools(server, ctx);
  registerCommentTools(server, ctx);
  registerAttachmentTools(server, ctx);
  registerWebhookTools(server, ctx);
}

export type { ToolContext } from "./helpers";
