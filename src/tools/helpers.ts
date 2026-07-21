import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Env } from "../types";
import type { AirtableClient } from "../airtable";

/** Shared context handed to every tool group. */
export interface ToolContext {
  env: Env;
  userId: string;
  client: AirtableClient;
}

export type ToolRegistrar = (server: McpServer, ctx: ToolContext) => void;

/** MCP text result from an arbitrary JSON-serializable value. */
export function jsonResult(data: unknown) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

export function errorResult(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

/** Run a handler, formatting success and failure into MCP results. */
export async function run(fn: () => Promise<unknown>) {
  try {
    return jsonResult(await fn());
  } catch (e) {
    return errorResult(e);
  }
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
