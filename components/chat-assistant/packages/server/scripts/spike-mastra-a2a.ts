/**
 * Spike: can Mastra's BUILT-IN A2A endpoint carry the A2UI extension?
 *
 * Starts a Mastra agent behind the stock Express adapter (model = a local fake
 * Anthropic endpoint, so no real model call is made) and answers four
 * questions by observation:
 *
 *   (a) can it return a data part with `metadata.mimeType = application/a2ui+json`?
 *   (b) can the agent card declare the A2UI extension?
 *   (c) can our code get the caller's bearer token?
 *   (d) does it stream?
 *
 * Run: npm run spike -w @chat-assistant/server
 */
import express from 'express';
import type { AddressInfo } from 'node:net';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { MastraServer } from '@mastra/express';
import { InMemoryTaskStore } from '@mastra/server/a2a/store';
import { createAnthropic } from '@ai-sdk/anthropic';
import { startFakeAnthropic } from '../test/support/fake-anthropic.js';

const A2UI_URI = 'https://a2ui.org/a2a-extension/a2ui/v0.9.1';
const TOKEN = 'spike-caller-token';

const fake = await startFakeAnthropic([{ text: 'Spike reply from the fake model.' }]);

const agent = new Agent({
  id: 'spike-agent',
  name: 'Spike Agent',
  instructions: 'Reply briefly.',
  // Per-request model: the caller's token becomes the model call's bearer.
  model: ({ requestContext }) =>
    createAnthropic({
      baseURL: `${fake.url}/v1`,
      authToken: String(requestContext.get('callerToken') ?? 'no-token-in-request-context'),
    })('claude-haiku-4-5-20251001'),
});

const mastra = new Mastra({ agents: { 'spike-agent': agent }, logger: false });

const app = express();
app.use(express.json());
const server = new MastraServer({ app, mastra, taskStore: new InMemoryTaskStore() });
server.registerContextMiddleware();
// Our own middleware, after Mastra built the request context.
app.use((req, res, next) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) res.locals.requestContext.set('callerToken', auth.slice(7));
  next();
});
await server.registerRoutes();

const listener = app.listen(0, '127.0.0.1');
await new Promise((r) => listener.once('listening', r));
const base = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;

const headers = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, 'X-A2A-Extensions': A2UI_URI };
const rpc = (method: string, parts: unknown[]) =>
  fetch(`${base}/api/a2a/spike-agent`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params: { message: { kind: 'message', role: 'user', messageId: crypto.randomUUID(), parts } },
    }),
  });

const findings: Record<string, string> = {};

// (b) the card
const card: any = await (await fetch(`${base}/api/.well-known/spike-agent/agent-card.json`, { headers })).json();
findings.b = `card.capabilities.extensions = ${JSON.stringify(card.capabilities?.extensions)} (no option on Mastra or the route to add one)`;

// (d) streaming, and (c) the token reaching code we control
const streamRes = await rpc('message/stream', [{ kind: 'text', text: 'hello' }]);
const streamText = await streamRes.text();
if (process.env.SPIKE_DEBUG) console.error(streamText.slice(0, 3000));
const events = streamText.split('\n\n').filter((e) => e.startsWith('data:'));
findings.d = `content-type=${streamRes.headers.get('content-type')}, ${events.length} SSE events`;
const kinds = new Set<string>();
const partShapes = new Set<string>();
for (const e of events) {
  const result = JSON.parse(e.slice(5)).result;
  kinds.add(result?.kind);
  for (const p of result?.artifact?.parts ?? []) partShapes.add(JSON.stringify(Object.keys(p).sort()));
}
findings.d += `, kinds=${[...kinds].join('|')}`;
findings.a = `part keys seen in artifacts: ${[...partShapes].join(' ')} (text only; a data part appears only for structured output and never carries metadata)`;
findings.c = `model endpoint received authorization="${fake.calls.at(-1)?.headers.authorization}"`;

// (a, inbound) an A2UI action is a data part: what does the built-in endpoint do with it?
const actionRes = await rpc('message/send', [
  {
    kind: 'data',
    metadata: { mimeType: 'application/a2ui+json' },
    data: [{ version: 'v0.9.1', action: { name: 'approve', surfaceId: 's', sourceComponentId: 'b', timestamp: new Date().toISOString(), context: {} } }],
  },
]);
const actionBody: any = await actionRes.json();
findings['a-inbound-array'] = `HTTP ${actionRes.status}: ${JSON.stringify(actionBody.error ?? actionBody.result?.status).slice(0, 200)}`;
// Same action, with `data` as an object (the only shape Mastra's schema accepts).
const actionObjRes = await rpc('message/send', [
  { kind: 'data', data: { action: { name: 'approve', surfaceId: 's', sourceComponentId: 'b', context: {} } } },
]);
const actionObjBody: any = await actionObjRes.json();
findings['a-inbound-object'] = `HTTP ${actionObjRes.status}: ${JSON.stringify(
  actionObjBody.error?.message ?? actionObjBody.result?.status,
).slice(0, 200)}`;

// (c, caveat) can a caller inject request-context values through the body?
const before = fake.calls.length;
await fetch(`${base}/api/a2a/spike-agent`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' }, // no bearer at all
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'message/send',
    requestContext: { callerToken: 'injected-by-request-body' },
    params: { message: { kind: 'message', role: 'user', messageId: crypto.randomUUID(), parts: [{ kind: 'text', text: 'hi' }] } },
  }),
});
findings['c-caveat'] =
  fake.calls.length > before
    ? `with NO bearer and body.requestContext.callerToken set, model endpoint received authorization="${fake.calls.at(-1)?.headers.authorization}"`
    : 'request without bearer did not reach the model';

console.log(JSON.stringify(findings, null, 2));

listener.close();
await fake.close();
process.exit(0);
