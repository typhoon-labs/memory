/**
 * The real delivery-mcp client against an endpoint that answers the way
 * Agentgateway 1.6 does for a tool the caller's role may not use: HTTP 400
 * with a JSON-RPC error in the body, where a server would answer 200.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { createDeliveryMcp } from '../src/downstream/delivery-mcp.js';
import { Refusal } from '../src/downstream/types.js';

let server: http.Server;
let url: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      const rpc = JSON.parse(body) as { id?: number; method: string; params?: { protocolVersion?: string } };
      const json = (status: number, payload: unknown) =>
        res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
      if (rpc.method === 'initialize') {
        json(200, {
          jsonrpc: '2.0',
          id: rpc.id,
          result: {
            protocolVersion: rpc.params?.protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: 'gateway', version: 'test' },
          },
        });
      } else if (rpc.method === 'tools/call') {
        json(400, { jsonrpc: '2.0', id: rpc.id, error: { code: -32602, message: 'Unknown tool: approve_change' } });
      } else {
        res.writeHead(202).end();
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp/delivery`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

test("the gateway's answer for a tool the caller's role lacks is a refusal by the gateway", async () => {
  const delivery = createDeliveryMcp(url, 'test');
  try {
    const refused: unknown = await delivery.callTool('a-token', 'approve_change', { change_id: 'CHG-0001' }).catch((err) => err);
    expect(refused).toBeInstanceOf(Refusal);
    expect(refused).toMatchObject({ layer: 'gateway', status: 400 });
    expect((refused as Refusal).message).toMatch(/^Refused by the gateway/);
  } finally {
    await delivery.close();
  }
});
