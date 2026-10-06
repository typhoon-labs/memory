/**
 * End to end over HTTP: the real server, an A2A client built on the official
 * SDK, stub downstreams, a run-time test issuer and a fake model endpoint.
 */
import { SignJWT, generateKeyPair } from 'jose';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { A2aSession } from '../scripts/lib/a2a-session.js';
import { A2UI_EXTENSION_URI, A2UI_MIME_TYPE, BASIC_CATALOG_ID } from '../src/a2a/wire.js';
import { newProcessor } from './support/a2ui.js';
import { alertmanagerPayload, startTestServer, type TestServer } from './support/server.js';

let server: TestServer;
beforeAll(async () => {
  server = await startTestServer({ seed: true, phaseMs: 400, cors: 'http://localhost:18194' });
});
afterAll(() => server.close());

const as = async (who: string, version: '1.0' | '0.3' = '1.0') => A2aSession.connect(server.url, await server.token(who), version);
const enabled = (s: A2aSession) =>
  s
    .buttons()
    .filter((b) => !b.disabledBecause)
    .map((b) => b.id)
    .sort();

function rpc(token: string | undefined, body: unknown, headers: Record<string, string> = {}) {
  return fetch(server.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body: JSON.stringify(body),
  });
}
const syncV1 = {
  jsonrpc: '2.0',
  id: 1,
  method: 'SendMessage',
  params: {
    message: {
      messageId: 'm-1',
      role: 'ROLE_USER',
      parts: [{ data: { request: 'sync' }, mediaType: 'application/vnd.chat-assistant.sync+json' }],
    },
  },
};

describe('authentication', () => {
  test('every A2A request needs a valid bearer token', async () => {
    expect((await rpc(undefined, syncV1)).status).toBe(401);
    expect((await rpc('not-a-jwt', syncV1)).status).toBe(401);

    // Right claims, wrong signing key.
    const { privateKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT({ preferred_username: 'platform-engineer', roles: ['platform-engineer'], team: 'platform' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer('http://test-issuer.invalid/realms/demo')
      .setAudience('agentgateway')
      .setExpirationTime('5m')
      .sign(privateKey);
    const res = await rpc(forged, syncV1);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'unauthorized' });
  });

  test('identity comes only from the token: a header or body field naming another user is ignored', async () => {
    const res = await rpc(
      await server.token('developer'),
      { ...syncV1, params: { ...syncV1.params, user: 'platform-engineer', roles: ['platform-engineer'] } },
      { 'A2A-Version': '1.0', 'x-user': 'platform-engineer', 'x-roles': 'platform-engineer' },
    );
    const body: any = await res.json();
    expect(body.result.message.parts[0].data.viewer).toEqual({ user: 'developer', roles: ['developer'], team: 'search' });
  });
});

describe('agent card and wire format', () => {
  test('the card declares the A2UI extension v0.9.1, streaming, and both protocol versions', async () => {
    const v1: any = await (await fetch(`${server.url}/.well-known/agent-card.json`, { headers: { 'A2A-Version': '1.0' } })).json();
    expect(v1.capabilities.streaming).toBe(true);
    expect(v1.capabilities.extensions).toEqual([
      expect.objectContaining({ uri: A2UI_EXTENSION_URI, params: { supportedCatalogIds: [BASIC_CATALOG_ID], acceptsInlineCatalogs: false } }),
    ]);
    expect(v1.supportedInterfaces.map((i: any) => `${i.protocolBinding} ${i.protocolVersion}`)).toEqual(['JSONRPC 1.0', 'JSONRPC 0.3']);
    expect(v1.securitySchemes.oidc.openIdConnectSecurityScheme.openIdConnectUrl).toContain('/.well-known/openid-configuration');

    const legacy: any = await (await fetch(`${server.url}/a2a/.well-known/agent-card.json`)).json();
    expect(legacy.protocolVersion).toBe('0.3');
    // A 0.3 card names its address in `url` only, so a gateway that rewrites card addresses rewrites that one.
    expect(typeof legacy.url).toBe('string');
    expect(legacy.supportedInterfaces).toBeUndefined();
    expect(legacy.capabilities.extensions[0].uri).toBe(A2UI_EXTENSION_URI);
  });

  test('A2UI travels in a data part with metadata.mimeType application/a2ui+json whose data is an array of messages', async () => {
    const res = await rpc(await server.token('developer'), syncV1, { 'A2A-Version': '1.0', 'X-A2A-Extensions': A2UI_EXTENSION_URI });
    // The extension asked for with the A2UI specification's header is reported as activated.
    expect(res.headers.get('a2a-extensions')).toBe(A2UI_EXTENSION_URI);
    const body: any = await res.json();
    const part = body.result.message.parts.find((p: any) => p.metadata?.mimeType === A2UI_MIME_TYPE);
    expect(Array.isArray(part.data)).toBe(true);
    expect(part.data.map((m: any) => Object.keys(m).sort().join('+'))).toEqual([
      'createSurface+version',
      'updateComponents+version',
      'updateDataModel+version',
    ]);
    expect(part.data[0]).toMatchObject({ version: 'v0.9.1', createSurface: { catalogId: BASIC_CATALOG_ID, sendDataModel: true } });
    expect(body.result.message.extensions).toEqual([A2UI_EXTENSION_URI]);
    // The official A2UI processor accepts exactly what came over the wire.
    expect(() => newProcessor().apply(part.data)).not.toThrow();
  });

  test('a browser preflight from an allowed origin is answered; other origins get no CORS headers', async () => {
    const preflight = (origin: string) =>
      fetch(server.url, {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type,a2a-version' },
      });
    const ok = await preflight('http://localhost:18194');
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('http://localhost:18194');
    expect(ok.headers.get('access-control-allow-headers')).toContain('A2A-Version');
    expect((await preflight('http://evil.example')).headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('the incident, handled by three roles over A2A', () => {
  test('each role sees the same incident with only its own actions', async () => {
    const [developer, manager, engineer] = await Promise.all([as('developer'), as('incident-manager'), as('platform-engineer')]);
    await Promise.all([developer.sync(), manager.sync(), engineer.sync()]);
    for (const s of [developer, manager, engineer]) {
      expect([...s.surfaces.keys()]).toEqual(['incident-INC-0001']);
      expect(s.text('title')).toBe('Search requests are failing');
    }
    expect(developer.buttons().map((b) => b.label)).toEqual(['Propose rollback to 2.0.0']);
    expect(manager.buttons().map((b) => b.id)).toEqual(['approve', 'reject', 'draft', 'post']);
    expect(engineer.buttons().map((b) => b.id)).toEqual(['apply', 'restart']);
    expect(enabled(engineer)).toEqual(['restart']);
    // A second sync with nothing changed sends no A2UI at all.
    expect((await developer.sync()).a2ui).toEqual([]);
  });

  test('refusals name their layer: the gateway, or the service and its rule', async () => {
    const developer = await as('developer');
    await developer.sync();
    // A developer sends the incident-manager's action directly: the gateway does not offer that tool.
    const gateway = await developer.action('approve_change', { incident_id: 'INC-0001', change_id: 'CHG-0001' });
    expect(gateway.state).toBe('REJECTED');
    expect(gateway.text).toMatch(/^Refused by the gateway \(HTTP 403\)/);
    expect(gateway.metadata.refusal).toMatchObject({ layer: 'gateway', status: 403 });
    expect(developer.text('notice')).toBe(gateway.text);

    // A developer from another team proposes: allowed by the gateway, refused by the service's own rule.
    const outsider = await as('developer-other-team');
    await outsider.sync();
    const service = await outsider.click('propose');
    expect(service.state).toBe('REJECTED');
    expect(service.text).toMatch(/^Refused by the service: team_owns_service - /);
    expect(service.metadata.refusal).toMatchObject({ layer: 'service', rule: 'team_owns_service' });
    expect(outsider.text('notice')).toBe(service.text);
  });

  test('propose, approve, apply: each step shows up for the other roles, through applying and verifying to resolved', async () => {
    const [developer, manager, engineer] = await Promise.all([as('developer'), as('incident-manager'), as('platform-engineer')]);
    await Promise.all([developer.sync(), manager.sync(), engineer.sync()]);

    // An engineer cannot apply before approval, even by sending the action directly.
    const early = await engineer.action('apply_change', { incident_id: 'INC-0001', change_id: 'CHG-0001' });
    expect(early.state).not.toBe('COMPLETED');

    const proposed = await developer.click('propose');
    expect(proposed.state).toBe('COMPLETED');
    expect(proposed.events).toEqual(['task', 'statusUpdate']);
    expect(enabled(developer)).toEqual([]);

    // The manager's next poll brings the proposal.
    expect(enabled(manager)).toEqual(['draft']);
    const polled = await manager.sync();
    expect(polled.a2ui.map((m) => Object.keys(m).find((k) => k !== 'version'))).toEqual(['updateComponents', 'updateDataModel', 'updateDataModel']);
    expect(enabled(manager)).toEqual(['approve', 'draft']);
    expect(manager.text('change-status')).toBe('Change status: proposed');

    // The engineer sees it too, but Apply stays disabled until approval.
    await engineer.sync();
    expect(engineer.buttons().find((b) => b.id === 'apply')?.disabledBecause).toBe('Waiting for an incident-manager to approve');
    const refused = await engineer.action('apply_change', { incident_id: 'INC-0001', change_id: 'CHG-0001' });
    expect(refused.state).toBe('REJECTED');
    expect(refused.metadata.refusal).toMatchObject({ layer: 'service', rule: 'change_is_approved' });

    expect((await manager.click('approve')).state).toBe('COMPLETED');
    await engineer.sync();
    expect(enabled(engineer)).toEqual(['apply', 'restart']);

    // Apply goes through remediation-agent and streams the card while it works.
    const applied = await engineer.click('apply');
    expect(applied.state).toBe('COMPLETED');
    expect(applied.text).toContain('a real search request succeeded');
    expect(applied.events.filter((e) => e === 'statusUpdate').length).toBeGreaterThan(1);
    expect(engineer.text('fact-status-value')).toBe('resolved');
    expect(engineer.text('fact-version-value')).toBe('2.0.0');
    expect(engineer.text('timeline')).toContain('Rollback to 2.0.0 verified');
    expect(engineer.text('progress-4')).toBe('✓ Resolved');
    expect(enabled(engineer)).toEqual([]);

    await Promise.all([developer.sync(), manager.sync()]);
    expect(developer.text('fact-status-value')).toBe('resolved');
    expect(manager.text('change')).toContain('applied by platform-engineer');
  }, 20_000);
});

describe('incident-manager: reject and status update', () => {
  let s: TestServer;
  beforeAll(async () => {
    s = await startTestServer({ seed: true });
  });
  afterAll(() => s.close());

  test('reject with a reason; draft through comms-agent, edit, post', async () => {
    const developer = await A2aSession.connect(s.url, await s.token('developer'));
    const manager = await A2aSession.connect(s.url, await s.token('incident-manager'));
    await developer.sync();
    await developer.click('propose');
    await manager.sync();

    // Reject is disabled until a reason is typed.
    expect(manager.buttons().find((b) => b.id === 'reject')?.disabledBecause).toBe('Give a reason to reject');
    manager.type('reject-reason', 'Try a restart first');
    const rejected = await manager.click('reject');
    expect(rejected.state).toBe('COMPLETED');
    expect(manager.text('change')).toContain('Reason: Try a restart first');
    expect(manager.surfaces.get('incident-INC-0001')!.model.reject.reason).toBe('');

    // The developer can propose again after a rejection.
    await developer.sync();
    expect(developer.buttons().find((b) => b.id === 'propose')?.disabledBecause).toBeUndefined();

    // Draft: comms-agent returns text and posts nothing.
    expect(manager.buttons().find((b) => b.id === 'post')?.disabledBecause).toBe('Draft a status update first');
    const drafted = await manager.click('draft');
    expect(drafted.state).toBe('COMPLETED');
    const draft = manager.surfaces.get('incident-INC-0001')!.model.draft.text as string;
    expect(draft).toContain('INC-0001');

    // A poll does not overwrite the manager's edit of the draft.
    manager.type('draft-text', `${draft} (edited)`);
    await manager.sync();
    expect(manager.surfaces.get('incident-INC-0001')!.model.draft.text).toBe(`${draft} (edited)`);

    const posted = await manager.click('post');
    expect(posted.state).toBe('COMPLETED');
    expect(manager.text('timeline')).toContain('Status update by incident-manager:');
    expect(manager.text('timeline')).toContain('(edited)');
    expect(manager.surfaces.get('incident-INC-0001')!.model.draft.text).toBe('');

    // A developer asking comms-agent for a draft is refused at the gateway.
    const refused = await developer.action('draft_status_update', { incident_id: 'INC-0001' });
    expect(refused.metadata.refusal).toMatchObject({ layer: 'gateway' });
  });

  test('"approver is not the proposer" is the service\'s rule', async () => {
    const fresh = await startTestServer({ seed: true });
    try {
      const twoHats = await A2aSession.connect(fresh.url, await fresh.token('two-hats'));
      await twoHats.sync();
      expect((await twoHats.click('propose')).state).toBe('COMPLETED');
      const own = await twoHats.click('approve');
      expect(own.state).toBe('REJECTED');
      expect(own.text).toMatch(/^Refused by the service: approver_is_not_proposer - /);
    } finally {
      await fresh.close();
    }
  });

  test('the same flow works for an A2A 0.3 client', async () => {
    const fresh = await startTestServer({ seed: true });
    try {
      const developer = await A2aSession.connect(fresh.url, await fresh.token('developer'), '0.3');
      expect(developer.client.protocolVersion).toBe('0.3');
      await developer.sync();
      expect(developer.buttons().map((b) => b.label)).toEqual(['Propose rollback to 2.0.0']);
      const proposed = await developer.click('propose');
      expect(proposed.state).toBe('COMPLETED');
      expect(developer.text('change-status')).toBe('Change status: proposed');
    } finally {
      await fresh.close();
    }
  });
});

describe('chat text goes to the Mastra agent and the model', () => {
  let s: TestServer;
  beforeAll(async () => {
    s = await startTestServer({ seed: true });
  });
  afterAll(() => s.close());

  test("the reply streams, and the model call carries the caller's token", async () => {
    s.model.script([{ text: 'Search is failing since version 2.1.0.' }]);
    const token = await s.token('developer');
    const developer = await A2aSession.connect(s.url, token);
    const reply = await developer.chat('What is broken?');
    expect(reply.state).toBe('COMPLETED');
    expect(reply.text.replace(/\n/g, '')).toBe('Search is failing since version 2.1.0.');
    expect(reply.events.filter((e) => e === 'artifactUpdate').length).toBeGreaterThan(1);

    const call = s.model.calls.at(-1)!;
    expect(call.path).toBe('/v1/messages');
    expect(call.headers.authorization).toBe(`Bearer ${token}`);
    expect(call.headers['x-api-key']).toBeUndefined();
    expect(call.headers['anthropic-version']).toBe('2023-06-01');
    expect(call.body.model).toBe('claude-haiku-4-5-20251001');
    expect(call.body.stream).toBe(true);
    // Nothing the current Sonnet rejects: no sampling parameters, no forced tool, thinking not disabled.
    expect(call.body.temperature).toBeUndefined();
    expect(call.body.top_p).toBeUndefined();
    expect(call.body.top_k).toBeUndefined();
    expect(['auto', undefined]).toContain(call.body.tool_choice?.type);
    expect(call.body.thinking?.type).not.toBe('disabled');
    expect(call.body.tools.map((t: any) => t.name).sort()).toEqual(['ask_diagnosis_agent', 'get_incident', 'list_incidents']);
    expect(JSON.stringify(call.body.system)).toContain('Signed-in user: developer. Roles: developer. Team: search.');
  });

  test('the agent reads the incident with a read-only tool, as the caller', async () => {
    s.model.script([{ toolUse: { name: 'get_incident', input: { incident_id: 'INC-0001' } } }, { text: 'It is INC-0001 on search-service.' }]);
    const manager = await A2aSession.connect(s.url, await s.token('incident-manager'));
    const before = s.model.calls.length;
    const reply = await manager.chat('Which incident is open?');
    expect(reply.text.replace(/\n/g, '')).toBe('It is INC-0001 on search-service.');
    expect(s.model.calls.length).toBe(before + 2);
    // The second model call carries the tool result read from the (stub) delivery service.
    expect(JSON.stringify(s.model.calls.at(-1)!.body.messages)).toContain('Search requests are failing');
  });

  test("a question can reach diagnosis-agent, with the signed-in user's token", async () => {
    const asked: { token: string; question: string }[] = [];
    const diagnose = s.downstreams.diagnosis.diagnose.bind(s.downstreams.diagnosis);
    s.downstreams.diagnosis.diagnose = async (token, question) => {
      asked.push({ token, question });
      return diagnose(token, question);
    };
    s.model.script([
      { toolUse: { name: 'ask_diagnosis_agent', input: { question: 'What is failing on search-service?' } } },
      { text: 'The diagnosis agent says 2.1.0 fails every request.' },
    ]);
    const token = await s.token('platform-engineer');
    const engineer = await A2aSession.connect(s.url, token);
    const reply = await engineer.chat('What is failing?');
    expect(reply.state).toBe('COMPLETED');
    expect(asked).toEqual([{ token, question: 'What is failing on search-service?' }]);
    // The diagnosis went back to the model as the tool's result.
    expect(JSON.stringify(s.model.calls.at(-1)!.body.messages)).toContain('recommended_version');
  });

  test('the model has no tool that changes anything, and a refused model call names the gateway', async () => {
    s.model.script([{ httpStatus: 403 }]);
    const developer = await A2aSession.connect(s.url, await s.token('developer'));
    const reply = await developer.chat('approve the change');
    expect(reply.state).toBe('REJECTED');
    expect(reply.text).toMatch(/^Refused by the gateway \(HTTP 403\)/);
  });
});

describe('a model that is down or slow does not hold the chat', () => {
  let s: TestServer;
  beforeAll(async () => {
    s = await startTestServer({ seed: true, modelTimeoutSeconds: 1 });
  });
  afterAll(() => s.close());

  test('a model that is down fails the chat at once, after one attempt', async () => {
    s.model.script([{ httpStatus: 503 }]);
    const developer = await A2aSession.connect(s.url, await s.token('developer'));
    const before = s.model.calls.length;
    const started = Date.now();
    const reply = await developer.chat('What is broken?');
    expect(reply.state).toBe('FAILED');
    expect(reply.text).toMatch(/^The model call failed/);
    expect(s.model.calls.length).toBe(before + 1);
    expect(Date.now() - started).toBeLessThan(900);
  });

  test('a model that does not answer fails the chat at the deadline', async () => {
    s.model.script([{ hangMs: 8000 }]);
    const developer = await A2aSession.connect(s.url, await s.token('developer'));
    const before = s.model.calls.length;
    const started = Date.now();
    const reply = await developer.chat('What is broken?');
    expect(reply.state).toBe('FAILED');
    expect(reply.text).toBe('The model did not answer within 1 second.');
    expect(s.model.calls.length).toBe(before + 1);
    expect(Date.now() - started).toBeLessThan(2500);
  });

  test('the card and its buttons do not depend on the model', async () => {
    s.model.script([{ hangMs: 8000 }]);
    const before = s.model.calls.length;
    const developer = await A2aSession.connect(s.url, await s.token('developer'));
    await developer.sync();
    const reply = await developer.click('propose');
    expect(reply.state).toBe('COMPLETED');
    expect(s.model.calls.length).toBe(before);
  });
});

describe('alert hook', () => {
  const kinds = (a2ui: Record<string, unknown>[]) => a2ui.map((m) => Object.keys(m).find((k) => k !== 'version'));
  const post = async (s: TestServer, who: string | undefined, body: unknown) =>
    fetch(`${s.url}/hooks/alert`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(who ? { authorization: `Bearer ${await s.token(who)}` } : {}) },
      body: JSON.stringify(body),
    });

  describe('with a diagnosis agent that answers', () => {
    let s: TestServer;
    beforeAll(async () => {
      s = await startTestServer({ seed: false, diagnosisMs: 400 });
    });
    afterAll(() => s.close());

    test('needs the machine identity', async () => {
      expect((await post(s, undefined, alertmanagerPayload())).status).toBe(401);
      expect((await post(s, 'platform-engineer', alertmanagerPayload())).status).toBe(403);
    });

    test('the incident is opened first: the card is there, diagnosing, before the diagnosis arrives; then it fills in, in place', async () => {
      const started = Date.now();
      const first = await post(s, 'alert-automation', alertmanagerPayload());
      expect(first.status).toBe(200);
      expect(await first.json()).toEqual({
        results: [{ service: 'search-service', outcome: 'opened', incident_id: 'INC-0001', diagnosis: 'started' }],
      });
      // The webhook was answered without waiting for the diagnosis.
      expect(Date.now() - started).toBeLessThan(350);

      const developer = await A2aSession.connect(s.url, await s.token('developer'));
      await developer.sync();
      expect(developer.text('title')).toBe('Search requests are failing');
      expect(developer.text('impact')).toBe('100% of searches failing; 412 failed in 5 minutes');
      expect(developer.text('cause')).toMatch(/^Diagnosing… The diagnosis agent started at \d\d:\d\d:\d\d UTC\./);
      expect(developer.buttons()).toEqual([
        { id: 'propose', label: 'Propose rollback', action: 'propose_rollback', disabledBecause: 'Waiting for the diagnosis' },
      ]);

      // The same alert again while the diagnosis runs: nothing new is opened or started.
      expect(await (await post(s, 'alert-automation', alertmanagerPayload())).json()).toEqual({
        results: [{ service: 'search-service', outcome: 'already_open', incident_id: 'INC-0001', diagnosis: 'in_progress' }],
      });

      await s.alertsSettled();
      const filled = await developer.sync();
      // An update in place: the surface is not deleted and created again, so the button is the same one.
      expect(kinds(filled.a2ui)).toEqual(['updateComponents', 'updateDataModel', 'updateDataModel']);
      expect(developer.text('cause')).toContain('fails every request since its rollout');
      expect(developer.buttons()).toEqual([
        { id: 'propose', label: 'Propose rollback to 2.0.0', action: 'propose_rollback', disabledBecause: undefined },
      ]);
      expect(developer.text('timeline')).toContain('Incident opened by service-account-alert-automation');
      expect(developer.text('timeline')).toContain('Diagnosis recorded: roll back to 2.0.0');

      // And once more after the diagnosis is recorded.
      expect(await (await post(s, 'alert-automation', alertmanagerPayload())).json()).toEqual({
        results: [{ service: 'search-service', outcome: 'already_open', incident_id: 'INC-0001', diagnosis: 'skipped' }],
      });
      expect((await developer.click('propose')).state).toBe('COMPLETED');
    });

    test('a resolved alert opens nothing', async () => {
      const res = await post(s, 'alert-automation', {
        ...alertmanagerPayload('registration-service'),
        status: 'resolved',
        alerts: [{ status: 'resolved', labels: { service: 'registration-service' } }],
      });
      expect(await res.json()).toEqual({ results: [] });
    });
  });

  test('a diagnosis that fails is said plainly on the card, each role keeps the actions that make sense, and a repeat alert tries again', async () => {
    const s = await startTestServer({ seed: false, diagnosis: 'fails' });
    try {
      expect(await (await post(s, 'alert-automation', alertmanagerPayload())).json()).toEqual({
        results: [{ service: 'search-service', outcome: 'opened', incident_id: 'INC-0001', diagnosis: 'started' }],
      });
      await s.alertsSettled();

      const [developer, manager, engineer] = await Promise.all(
        ['developer', 'incident-manager', 'platform-engineer'].map(async (who) => A2aSession.connect(s.url, await s.token(who))),
      );
      await Promise.all([developer!.sync(), manager!.sync(), engineer!.sync()]);
      for (const viewer of [developer!, manager!, engineer!]) {
        expect(viewer.text('cause')).toBe('Diagnosis failed: diagnosis-agent: no answer within 60 seconds. No version is recommended.');
      }
      const enabled = (v: A2aSession) => v.buttons().filter((b) => !b.disabledBecause).map((b) => b.id);
      expect(enabled(manager!)).toEqual(['draft']);
      expect(enabled(engineer!)).toEqual(['restart']);
      // The developer can still propose, naming the version by hand; the service checks it.
      expect(developer!.buttons()).toEqual([
        { id: 'propose', label: 'Propose rollback', action: 'propose_rollback', disabledBecause: 'Enter a version' },
      ]);
      developer!.type('propose-version', '9.9.9');
      const wrong = await developer!.click('propose');
      expect(wrong.metadata.refusal).toMatchObject({ layer: 'service', rule: 'target_is_retained_earlier_version' });

      // The alert repeats: no second incident, and the diagnosis is tried again and now succeeds.
      expect(await (await post(s, 'alert-automation', alertmanagerPayload())).json()).toEqual({
        results: [{ service: 'search-service', outcome: 'already_open', incident_id: 'INC-0001', diagnosis: 'started' }],
      });
      await s.alertsSettled();
      await developer!.sync();
      expect(developer!.text('cause')).toContain('fails every request since its rollout');
      expect(developer!.buttons().map((b) => [b.label, b.disabledBecause])).toEqual([['Propose rollback to 2.0.0', undefined]]);
      // What the developer had typed is still in their data model after the card was rebuilt without the field.
      expect(developer!.model().propose.version).toBe('9.9.9');
    } finally {
      await s.close();
    }
  });

  test('with no diagnosis agent configured the webhook says so at once, and the incident is still opened', async () => {
    const s = await startTestServer({ seed: false, diagnosis: 'not-configured' });
    try {
      expect(await (await post(s, 'alert-automation', alertmanagerPayload())).json()).toEqual({
        results: [
          {
            service: 'search-service',
            outcome: 'opened',
            incident_id: 'INC-0001',
            diagnosis: 'failed',
            message: 'diagnosis-agent: DIAGNOSIS_AGENT_URL is not set',
          },
        ],
      });
      const developer = await A2aSession.connect(s.url, await s.token('developer'));
      await developer.sync();
      expect(developer.text('cause')).toBe('Diagnosis failed: diagnosis-agent: DIAGNOSIS_AGENT_URL is not set. No version is recommended.');
      developer.type('propose-version', '2.0.0');
      expect((await developer.click('propose')).state).toBe('COMPLETED');
      expect(developer.text('change-status')).toBe('Change status: proposed');
    } finally {
      await s.close();
    }
  });
});
