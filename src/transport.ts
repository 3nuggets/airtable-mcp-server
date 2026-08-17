import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * A request-scoped MCP transport for Cloudflare Workers.
 *
 * The official Streamable HTTP transport assumes a Node server holding a session
 * across requests. We deliberately hold nothing: each HTTP request builds a server,
 * runs the message, returns the reply and is discarded. The MCP spec allows a plain
 * `application/json` response to a POST, which is what this produces.
 */
class CollectingTransport implements Transport {
  onmessage?: (message: any, extra?: any) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  private collected: any[] = [];
  private pending = new Set<string | number>();
  private settle?: (messages: any[]) => void;

  async start(): Promise<void> {}

  async send(message: any): Promise<void> {
    this.collected.push(message);
    const isReply = message && "id" in message && ("result" in message || "error" in message);
    if (isReply && this.pending.delete(message.id) && this.pending.size === 0) {
      this.settle?.(this.collected);
    }
  }

  async close(): Promise<void> {
    this.onclose?.();
  }

  awaitReplies(ids: (string | number)[]): Promise<any[]> {
    if (ids.length === 0) return Promise.resolve(this.collected);
    this.pending = new Set(ids);
    return new Promise((resolve) => {
      this.settle = resolve;
    });
  }

  deliver(message: any): void {
    this.onmessage?.(message);
  }
}

const isRequest = (m: any): boolean =>
  m && typeof m === "object" && "method" in m && "id" in m && m.id !== null && m.id !== undefined;

/**
 * Run one or more JSON-RPC messages against a freshly built server and return the
 * replies. Notifications produce no reply, in which case the result is empty.
 */
export async function runMessages(
  server: McpServer,
  messages: any[],
  timeoutMs = 110_000,
): Promise<any[]> {
  const transport = new CollectingTransport();
  await server.connect(transport);

  const ids = messages.filter(isRequest).map((m) => m.id);
  const replies = transport.awaitReplies(ids);
  for (const message of messages) transport.deliver(message);

  const timer = new Promise<any[]>((_, reject) =>
    setTimeout(() => reject(new Error("Timed out handling MCP request")), timeoutMs),
  );

  try {
    return await Promise.race([replies, timer]);
  } finally {
    await server.close().catch(() => {});
  }
}
