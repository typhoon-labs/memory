/**
 * Delegation: the caller's token is exchanged at chain-sts and only the issued
 * token goes downstream. A fake chain-sts, a fake gateway in front of
 * delivery-mcp and the agents, and the fake model record what each is sent.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { A2aSession } from '../scripts/lib/a2a-session.js';
import { createChat } from '../src/chat/agent.js';
import { loadConfig } from '../src/config.js';
import { createTokenExchange, type DownstreamToken } from '../src/downstream/delegation.js';
import { createDownstreams } from '../src/downstream/index.js';
import { DownstreamError, Refusal } from '../src/downstream/types.js';
import { startFakeAnthropic, type FakeAnthropic } from './support/fake-anthropic.js';
import { startFakeSts, type FakeSts } from './support/fake-sts.js';
import { startTestServer, type TestServer } from './support/server.js';

const USERS_TOKEN = 'the-users-own-token';
const REFUSED = { refuse: { error: 'unauthorized_client', description: "chat-assistant may not act on a user's own token" } };

let sts: FakeSts;
let dir: string;
let actorFile: string;

beforeAll(async () => {
  sts = await startFakeSts();
  dir = await mkdtemp(path.join(tmpdir(), 'chat-assistant-delegation-'));
  actorFile = path.join(dir, 'token');
});
afterAll(async () => {
  await sts.close();
  await rm(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  sts.exchanges.length = 0;
  sts.issued.length = 0;
  sts.metadataReads = 0;
  sts.answer({ issue: {} });
  sts.tokenEndpoint();
  await writeFile(actorFile, 'actor-token-1\n');
});

const exchanger = () => createTokenExchange({ metadataUrl: sts.metadataUrl, actorTokenFile: actorFile, audience: 'agentgateway' });

describe('the exchange at chain-sts', () => {
  afterEach(() => void vi.useRealTimers());

  test("asks as kagent's clients do: a form POST to the token_endpoint, without client authentication", async () => {
    const issued = await exchanger()(USERS_TOKEN);
    expect(issued).toBe(sts.issued[0]);
    expect(sts.exchanges).toHaveLength(1);
    const [{ form, headers }] = sts.exchanges;
    expect(form).toEqual({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: USERS_TOKEN,
      subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      actor_token: 'actor-token-1',
      actor_token_type: 'urn:ietf:params:oauth:token-type:jwt',
      audience: 'agentgateway',
    });
    expect(headers['content-type']).toMatch(/^application\/x-www-form-urlencoded/);
    expect(headers.authorization).toBeUndefined();
  });

  test('reads the actor token file again for every exchange: the kubelet replaces it', async () => {
    const tokenFor = exchanger();
    await tokenFor('caller-a');
    await writeFile(actorFile, 'actor-token-2');
    await tokenFor('caller-b');
    expect(sts.exchanges.map((e) => e.form.actor_token)).toEqual(['actor-token-1', 'actor-token-2']);
  });

  test('keeps the issued token per caller token until 30 seconds before it expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const tokenFor = exchanger();
    const first = await tokenFor('caller-a');
    expect(await tokenFor('caller-a')).toBe(first);
    expect(await tokenFor('caller-b')).not.toBe(first);
    expect(sts.exchanges).toHaveLength(2);

    vi.setSystemTime(Date.now() + 269_000);
    expect(await tokenFor('caller-a')).toBe(first);
    vi.setSystemTime(Date.now() + 2_000);
    const second = await tokenFor('caller-a');
    expect(second).not.toBe(first);
    expect(sts.exchanges.map((e) => e.form.subject_token)).toEqual(['caller-a', 'caller-b', 'caller-a']);
    // The metadata was read once.
    expect(sts.metadataReads).toBe(1);
  });

  test("without expires_in, the token's exp says when it expires", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    sts.answer({ issue: { lifetimeSeconds: 100, expiresIn: false } });
    const tokenFor = exchanger();
    const first = await tokenFor('caller-a');
    vi.setSystemTime(Date.now() + 69_000);
    expect(await tokenFor('caller-a')).toBe(first);
    vi.setSystemTime(Date.now() + 2_000);
    expect(await tokenFor('caller-a')).not.toBe(first);
  });

  test('a call that needs the token for longer than the kept one lasts gets a new one, which is kept instead', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const tokenFor = exchanger();
    const first = await tokenFor('caller-a');
    vi.setSystemTime(Date.now() + 150_000);
    expect(await tokenFor('caller-a', 120_000)).toBe(first);
    const second = await tokenFor('caller-a', 180_000);
    expect(second).not.toBe(first);
    expect(await tokenFor('caller-a')).toBe(second);
    expect(sts.exchanges).toHaveLength(2);
  });

  test('concurrent calls for one caller token share one exchange', async () => {
    const tokenFor = exchanger();
    const tokens = await Promise.all([tokenFor('caller-a'), tokenFor('caller-a'), tokenFor('caller-a', 180_000)]);
    expect(new Set(tokens).size).toBe(1);
    expect(sts.exchanges).toHaveLength(1);
  });

  test("chain-sts's refusal is a Refusal that names the RFC 6749 error; nothing is kept", async () => {
    sts.answer(REFUSED);
    const tokenFor = exchanger();
    const refused = await tokenFor('caller-a').catch((err) => err);
    expect(refused).toBeInstanceOf(Refusal);
    expect(refused).toMatchObject({ layer: 'gateway', status: 400, oauthError: 'unauthorized_client' });
    expect(refused.message).toBe("Refused by the token exchange (unauthorized_client): chat-assistant may not act on a user's own token");
    expect(refused.message).not.toContain('caller-a');

    sts.answer({ issue: {} });
    expect(await tokenFor('caller-a')).toBe(sts.issued[0]);
    expect(sts.exchanges).toHaveLength(2);
  });

  test('a 503 from chain-sts is a failure, not a refusal, and still names the error', async () => {
    sts.answer({ refuse: { error: 'temporarily_unavailable', description: 'the signing keys for the cluster could not be fetched', status: 503 } });
    const failed = await exchanger()('caller-a').catch((err) => err);
    expect(failed).toBeInstanceOf(DownstreamError);
    expect(failed.message).toBe(
      'chain-sts: the token exchange failed with HTTP 503 (temporarily_unavailable): the signing keys for the cluster could not be fetched',
    );
  });

  test('an actor token file that is missing or empty fails before anything is sent', async () => {
    const missing = await createTokenExchange({ metadataUrl: sts.metadataUrl, actorTokenFile: path.join(dir, 'none'), audience: 'agentgateway' })(
      'caller-a',
    ).catch((err) => err);
    expect(missing).toBeInstanceOf(DownstreamError);
    expect(missing.message).toBe(`chain-sts: the actor token file ${path.join(dir, 'none')} could not be read: ENOENT`);

    await writeFile(actorFile, '\n');
    const empty = await exchanger()('caller-a').catch((err) => err);
    expect(empty).toBeInstanceOf(DownstreamError);
    expect(empty.message).toMatch(/^chain-sts: the actor token file .* is empty$/);
    expect(sts.metadataReads).toBe(0);
    expect(sts.exchanges).toHaveLength(0);
  });

  test('when the token endpoint cannot be reached, the metadata is read again for the next exchange', async () => {
    const closed = http.createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const port = (closed.address() as AddressInfo).port;
    await new Promise((resolve) => closed.close(resolve));
    sts.tokenEndpoint(`http://127.0.0.1:${port}/token`);

    const tokenFor = exchanger();
    const failed = await tokenFor('caller-a').catch((err) => err);
    expect(failed).toBeInstanceOf(DownstreamError);
    expect(failed.message).toMatch(/^chain-sts: the token exchange failed: fetch failed/);

    sts.tokenEndpoint();
    expect(await tokenFor('caller-a')).toBe(sts.issued[0]);
    await tokenFor('caller-b');
    expect(sts.metadataReads).toBe(2);
  });
});

/** Stands in for the gateway's routes to delivery-mcp (MCP) and the three agents (A2A 0.3), and records every request. */
async function startFakeGateway() {
  const requests: { method: string; path: string; authorization?: string; rpc?: string }[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const rpc = req.method === 'POST' ? (JSON.parse(raw) as { id?: number; method: string; params?: { protocolVersion?: string } }) : undefined;
      requests.push({ method: req.method!, path: req.url!, authorization: req.headers.authorization, rpc: rpc?.method });
      const json = (payload: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
      if (!rpc) return void res.writeHead(req.url?.startsWith('/mcp') ? 405 : 404).end();
      if (req.url === '/mcp/delivery') {
        if (rpc.method === 'initialize') {
          return json({
            jsonrpc: '2.0',
            id: rpc.id,
            result: { protocolVersion: rpc.params?.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'delivery-mcp', version: 'test' } },
          });
        }
        if (rpc.method === 'tools/call') {
          return json({ jsonrpc: '2.0', id: rpc.id, result: { content: [{ type: 'text', text: '[]' }], structuredContent: { result: [] } } });
        }
        return void res.writeHead(202).end();
      }
      const agent = req.url?.split('/')[2];
      const outcome = agent === 'comms-agent' ? 'drafted' : 'applied';
      json({
        jsonrpc: '2.0',
        id: rpc.id,
        result: {
          kind: 'message',
          messageId: `reply-${requests.length}`,
          role: 'agent',
          parts: [
            { kind: 'text', text: `${agent} answered.` },
            { kind: 'data', data: { outcome } },
          ],
        },
      });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    url,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

describe('what goes downstream', () => {
  let gateway: Awaited<ReturnType<typeof startFakeGateway>>;
  let model: FakeAnthropic;
  beforeAll(async () => {
    gateway = await startFakeGateway();
    model = await startFakeAnthropic();
  });
  afterAll(async () => {
    await gateway.close();
    await model.close();
  });
  beforeEach(() => {
    gateway.requests.length = 0;
    model.calls.length = 0;
  });

  const identity = { user: 'platform-engineer', roles: ['platform-engineer'], team: 'platform', token: USERS_TOKEN };
  const configured = (delegation: boolean) =>
    loadConfig({
      OIDC_ISSUER: 'http://test-issuer.invalid/realms/demo',
      OIDC_JWKS_URL: 'http://test-issuer.invalid/realms/demo/certs',
      DELIVERY_MCP_URL: `${gateway.url}/mcp/delivery`,
      REMEDIATION_AGENT_URL: `${gateway.url}/a2a/remediation-agent`,
      COMMS_AGENT_URL: `${gateway.url}/a2a/comms-agent`,
      DIAGNOSIS_AGENT_URL: `${gateway.url}/a2a/diagnosis-agent`,
      MODEL_BASE_URL: model.url,
      ...(delegation ? { DELEGATION_METADATA_URL: sts.metadataUrl, DELEGATION_ACTOR_TOKEN_FILE: actorFile } : {}),
    });

  /** Every downstream once, as the caller: delivery-mcp, the three agents, and a chat answer that reads incidents. */
  async function callEverything(tokenFor?: DownstreamToken) {
    const config = configured(!!tokenFor);
    const d = createDownstreams(config, tokenFor);
    const chat = createChat(config, d, tokenFor);
    model.script([{ toolUse: { name: 'list_incidents', input: {} } }, { text: 'No incidents.' }]);
    const outcomes = await Promise.allSettled([
      d.delivery.callTool(USERS_TOKEN, 'list_incidents', {}),
      d.remediation.applyAndVerify(USERS_TOKEN, 'CHG-1'),
      d.comms.draftStatusUpdate(USERS_TOKEN, 'INC-1'),
      d.diagnosis.diagnose(USERS_TOKEN, 'Why is search-service failing?'),
      chat.reply({ identity, contextId: 'c-1', text: 'Anything open?', onDelta: () => {} }),
    ]);
    return outcomes;
  }

  const sent = () => [...gateway.requests.map((r) => r.authorization), ...model.calls.map((c) => c.headers.authorization)];

  test("delivery-mcp, the three agents and the model get the issued token, never the caller's", async () => {
    const outcomes = await callEverything(exchanger());
    expect(outcomes.map((o) => o.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled', 'fulfilled']);
    expect(sts.exchanges).toHaveLength(1);
    expect(new Set(gateway.requests.map((r) => r.path.split('/').slice(0, 3).join('/')))).toEqual(
      new Set(['/mcp/delivery', '/a2a/remediation-agent', '/a2a/comms-agent', '/a2a/diagnosis-agent']),
    );
    // Two model calls: the tool call and the answer; the tool read went to delivery-mcp.
    expect(model.calls).toHaveLength(2);
    expect(new Set(sent())).toEqual(new Set([`Bearer ${sts.issued[0]}`]));
    expect(JSON.stringify({ requests: gateway.requests, model: model.calls.map((c) => c.headers) })).not.toContain(USERS_TOKEN);
  });

  test('a refused exchange stops every call before it is made', async () => {
    sts.answer(REFUSED);
    const outcomes = await callEverything(exchanger());
    for (const outcome of outcomes.slice(0, 4)) {
      expect(outcome).toMatchObject({ status: 'rejected', reason: { name: 'Refusal', oauthError: 'unauthorized_client' } });
    }
    // The chat reply fails on the model call, with chain-sts's refusal as the cause.
    const chat = outcomes[4] as PromiseRejectedResult;
    expect(chat.status).toBe('rejected');
    let cause: any = chat.reason;
    while (cause && !(cause instanceof Refusal)) cause = cause.cause;
    expect(cause).toBeInstanceOf(Refusal);
    expect(gateway.requests).toEqual([]);
    expect(model.calls).toEqual([]);
  });

  test('delivery-mcp keeps one session while the issued token is kept, and opens a new one when it changes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const d = createDownstreams(configured(true), exchanger());
      await d.delivery.callTool(USERS_TOKEN, 'list_incidents', {});
      await d.delivery.callTool(USERS_TOKEN, 'list_incidents', {});
      vi.setSystemTime(Date.now() + 271_000);
      await d.delivery.callTool(USERS_TOKEN, 'list_incidents', {});
      const opened = gateway.requests.filter((r) => r.rpc === 'initialize').map((r) => r.authorization);
      expect(opened).toEqual([`Bearer ${sts.issued[0]}`, `Bearer ${sts.issued[1]}`]);
      expect(gateway.requests.filter((r) => r.rpc === 'tools/call').map((r) => r.authorization)).toEqual([
        `Bearer ${sts.issued[0]}`,
        `Bearer ${sts.issued[0]}`,
        `Bearer ${sts.issued[1]}`,
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("without delegation, the caller's own token goes downstream, as before", async () => {
    const outcomes = await callEverything();
    expect(outcomes.map((o) => o.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled', 'fulfilled']);
    expect(sts.exchanges).toHaveLength(0);
    expect(gateway.requests.length).toBeGreaterThan(4);
    expect(new Set(sent())).toEqual(new Set([`Bearer ${USERS_TOKEN}`]));
  });
});

describe('over A2A, with delegation', () => {
  let s: TestServer;
  beforeAll(async () => {
    s = await startTestServer({ seed: true, delegation: { metadataUrl: sts.metadataUrl, actorTokenFile: actorFile } });
  });
  afterAll(() => s.close());

  test('the card and the chat work on the issued token, and the model never sees the caller’s', async () => {
    const token = await s.token('developer');
    const developer = await A2aSession.connect(s.url, token);
    await developer.sync();
    expect(developer.surfaces.size).toBe(1);

    s.model.script([{ text: 'Search is failing.' }]);
    const reply = await developer.chat('What is broken?');
    expect(reply.state).toBe('COMPLETED');
    expect(s.model.calls.at(-1)!.headers.authorization).toBe(`Bearer ${sts.issued[0]}`);
    expect(sts.exchanges).toHaveLength(1);
    expect(sts.exchanges[0]!.form.subject_token).toBe(token);
  });

  test("a refused exchange shows as the token exchange's refusal, with its error code, on the card, the chat and a button", async () => {
    sts.answer(REFUSED);
    const manager = await A2aSession.connect(s.url, await s.token('incident-manager'));
    const before = s.model.calls.length;
    const words = "Refused by the token exchange (unauthorized_client): chat-assistant may not act on a user's own token";

    const page = await manager.sync();
    expect(page.text).toBe(words);
    expect(page.metadata.refusal).toMatchObject({ layer: 'gateway', status: 400, oauthError: 'unauthorized_client' });

    const chat = await manager.chat('What is broken?');
    expect(chat.state).toBe('REJECTED');
    expect(chat.text).toBe(words);
    expect(chat.metadata.refusal).toMatchObject({
      layer: 'gateway',
      title: 'Refused by the token exchange (unauthorized_client)',
      reason: "Chat-assistant may not act on a user's own token.",
    });
    expect(s.model.calls.length).toBe(before);

    const action = await manager.action('approve_change', { incident_id: 'INC-0001', change_id: 'CHG-0001' });
    expect(action.state).toBe('REJECTED');
    expect(action.text).toBe(words);
    expect(action.metadata.refusal).toMatchObject({ layer: 'gateway', title: 'Refused by the token exchange (unauthorized_client)' });
  });
});

describe('configuration', () => {
  const base = { OIDC_ISSUER: 'http://issuer.invalid', OIDC_JWKS_URL: 'http://issuer.invalid/certs', STUB_DOWNSTREAMS: '1' };

  test('both bindings: delegation, with the audience the gateway checks', () => {
    const config = loadConfig({ ...base, DELEGATION_METADATA_URL: sts.metadataUrl, DELEGATION_ACTOR_TOKEN_FILE: actorFile });
    expect(config.delegation).toEqual({ metadataUrl: sts.metadataUrl, actorTokenFile: actorFile });
    expect(config.oidc.audience).toBe('agentgateway');
  });

  test('neither: no delegation', () => {
    expect(loadConfig(base).delegation).toBeUndefined();
  });

  test("a caller's token may carry the gateway's audience, or those OIDC_ACCEPTED_AUDIENCES names", () => {
    expect(loadConfig(base).oidc.acceptedAudiences).toEqual(['agentgateway']);
    const both = loadConfig({ ...base, OIDC_ACCEPTED_AUDIENCES: 'agentgateway, chat-assistant' });
    expect(both.oidc.acceptedAudiences).toEqual(['agentgateway', 'chat-assistant']);
    // What goes downstream is still asked for the gateway's audience.
    expect(both.oidc.audience).toBe('agentgateway');
  });

  test('only one of the two, or a metadata URL that is not a URL, stops the start', () => {
    const half = /DELEGATION_METADATA_URL and DELEGATION_ACTOR_TOKEN_FILE are set together or not at all/;
    expect(() => loadConfig({ ...base, DELEGATION_METADATA_URL: sts.metadataUrl })).toThrow(half);
    expect(() => loadConfig({ ...base, DELEGATION_ACTOR_TOKEN_FILE: actorFile })).toThrow(half);
    expect(() => loadConfig({ ...base, DELEGATION_METADATA_URL: 'chain-sts', DELEGATION_ACTOR_TOKEN_FILE: actorFile })).toThrow(
      /DELEGATION_METADATA_URL is not a URL/,
    );
  });
});
