/**
 * delivery-mcp over MCP Streamable HTTP, called as the signed-in caller.
 * One MCP session per bearer token, kept for a short while so that the
 * 2-second card poll does not re-initialise on every request.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { findRefusal } from './normalize.js';
import { DownstreamError, Refusal, type Delivery } from './types.js';

const IDLE_MS = 60_000;
const MAX_SESSIONS = 100;
const UNKNOWN_TOOL = /unknown tool|tool not found|no such tool|tool .{0,80}not (found|available|allowed|permitted)/i;

interface Session {
  client: Promise<Client>;
  lastUsed: number;
}

/** Turns an MCP tool result into plain data: structured content first, then JSON text, then text. */
export function unwrapToolResult(result: Record<string, unknown>): unknown {
  const structured = result.structuredContent;
  if (structured !== undefined && structured !== null) {
    if (typeof structured === 'object' && !Array.isArray(structured)) {
      const keys = Object.keys(structured);
      // FastMCP wraps a non-object return value as {"result": ...}.
      if (keys.length === 1 && keys[0] === 'result') return (structured as { result: unknown }).result;
    }
    return structured;
  }
  const text = (Array.isArray(result.content) ? result.content : [])
    .filter((c): c is { type: 'text'; text: string } => c?.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('\n');
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createDeliveryMcp(url: string, clientVersion: string): Delivery & { close(): Promise<void> } {
  const sessions = new Map<string, Session>();

  async function open(token: string): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    });
    const client = new Client({ name: 'chat-assistant', version: clientVersion });
    await client.connect(transport);
    return client;
  }

  function drop(token: string) {
    const s = sessions.get(token);
    sessions.delete(token);
    s?.client.then((c) => c.close()).catch(() => undefined);
  }

  function session(token: string): Promise<Client> {
    const now = Date.now();
    for (const [key, s] of sessions) {
      if (now - s.lastUsed > IDLE_MS || sessions.size > MAX_SESSIONS) drop(key);
    }
    let s = sessions.get(token);
    if (!s) {
      s = { client: open(token), lastUsed: now };
      sessions.set(token, s);
    }
    s.lastUsed = now;
    return s.client;
  }

  return {
    async callTool(token, name, args) {
      try {
        const client = await session(token);
        const result = await client.callTool({ name, arguments: args });
        const payload = unwrapToolResult(result);
        if (result.isError) {
          const refusal = findRefusal(payload);
          if (refusal) throw refusal;
          const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
          if (UNKNOWN_TOOL.test(text)) {
            throw new Refusal({ layer: 'gateway', detail: `the tool ${name} is not offered to you` });
          }
          throw new DownstreamError('delivery-mcp', `${name} failed: ${text}`);
        }
        const refusal = findRefusal(payload);
        if (refusal) throw refusal;
        return payload;
      } catch (err) {
        if (err instanceof Refusal || err instanceof DownstreamError) throw err;
        drop(token);
        if (err instanceof StreamableHTTPError && (err.code === 401 || err.code === 403)) {
          throw new Refusal({
            layer: 'gateway',
            status: err.code,
            detail: err.message.replace(/^Streamable HTTP error: (Error POSTing to endpoint: )?/, '').slice(0, 300) || name,
          });
        }
        // Agentgateway answers a tools/call for a tool the caller's role may not use with
        // HTTP 400 and the JSON-RPC error "Unknown tool: <name>" in the body. The SDK reports
        // the status with the body as text, not as an McpError.
        if (err instanceof StreamableHTTPError && err.code === 400 && UNKNOWN_TOOL.test(err.message)) {
          throw new Refusal({ layer: 'gateway', status: 400, detail: `the tool ${name} is not offered to you` });
        }
        if (err instanceof McpError) {
          const refusal = findRefusal(err.data) ?? findRefusal(err.message);
          if (refusal) throw refusal;
          if (UNKNOWN_TOOL.test(err.message)) {
            throw new Refusal({ layer: 'gateway', detail: `the tool ${name} is not offered to you` });
          }
        }
        throw new DownstreamError('delivery-mcp', `${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    async close() {
      for (const key of [...sessions.keys()]) drop(key);
    },
  };
}
