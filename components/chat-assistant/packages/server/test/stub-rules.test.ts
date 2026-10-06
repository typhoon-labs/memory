import { beforeAll, describe, expect, test } from 'vitest';
import { createTestIssuer } from '../src/dev/test-issuer.js';
import { createStubDownstreams } from '../src/downstream/stub.js';
import { Refusal, type Downstreams } from '../src/downstream/types.js';

let token: (subject: string) => Promise<string>;
beforeAll(async () => {
  const issuer = await createTestIssuer({ issuer: 'http://test-issuer.invalid', audience: 'agentgateway' });
  token = (subject) => issuer.accessToken(subject);
});

async function refusal(run: Promise<unknown>): Promise<Refusal> {
  try {
    await run;
  } catch (err) {
    if (err instanceof Refusal) return err;
    throw err;
  }
  throw new Error('expected a refusal');
}

async function seeded(): Promise<Downstreams> {
  return createStubDownstreams({ seed: true, phaseMs: 20 });
}

describe('stub downstreams obey the conventions', () => {
  test('gateway layer: a tool is only offered to its role', async () => {
    const d = await seeded();
    const cases: [string, string, Record<string, unknown>][] = [
      ['developer', 'approve_change', { change_id: 'CHG-0001' }],
      ['developer', 'apply_change', { change_id: 'CHG-0001' }],
      ['incident-manager', 'propose_change', { incident_id: 'INC-0001', target_version: '2.0.0' }],
      ['platform-engineer', 'post_status_update', { incident_id: 'INC-0001', text: 'x' }],
      ['developer', 'open_incident', { service: 'search-service' }],
      ['incident-manager', 'restart_workload', { service: 'search-service' }],
    ];
    for (const [who, tool, args] of cases) {
      const r = await refusal(d.delivery.callTool(await token(who), tool, args));
      expect([who, tool, r.layer, r.status]).toEqual([who, tool, 'gateway', 403]);
      expect(r.message).toMatch(/^Refused by the gateway \(HTTP 403\)/);
    }
    // Reading is open to anyone signed in.
    const listed: any = await d.delivery.callTool(await token('platform-engineer'), 'list_incidents', {});
    expect(listed.incidents).toHaveLength(1);
  });

  test("service rule: the caller's team owns the service", async () => {
    const d = await seeded();
    const r = await refusal(
      d.delivery.callTool(await token('developer-other-team'), 'propose_change', { incident_id: 'INC-0001', target_version: '2.0.0' }),
    );
    expect([r.layer, r.rule]).toEqual(['service', 'team_owns_service']);
    expect(r.message).toMatch(/^Refused by the service: team_owns_service - /);
  });

  test('service rule: the target is a retained earlier version', async () => {
    const d = await seeded();
    for (const target of ['2.1.0', '1.0.0', '']) {
      const r = await refusal(d.delivery.callTool(await token('developer'), 'propose_change', { incident_id: 'INC-0001', target_version: target }));
      expect([r.layer, r.rule]).toEqual(['service', 'target_is_retained_earlier_version']);
    }
  });

  test('service rule: the approver is not the proposer', async () => {
    const d = await seeded();
    const twoHats = await token('two-hats');
    await d.delivery.callTool(twoHats, 'propose_change', { incident_id: 'INC-0001', target_version: '2.0.0' });
    const r = await refusal(d.delivery.callTool(twoHats, 'approve_change', { change_id: 'CHG-0001' }));
    expect([r.layer, r.rule]).toEqual(['service', 'approver_is_not_proposer']);
    // Someone else can.
    const approved: any = await d.delivery.callTool(await token('incident-manager'), 'approve_change', { change_id: 'CHG-0001' });
    expect(approved).toMatchObject({ status: 'approved', proposed_by: 'two-hats', approved_by: 'incident-manager', previous_version: '2.1.0' });
    expect(approved.history.map((h: any) => h.status)).toEqual(['proposed', 'approved']);
  });

  test('service rule: apply needs an approved change, and is idempotent on change_id', async () => {
    const d = await seeded();
    const engineer = await token('platform-engineer');
    await d.delivery.callTool(await token('developer'), 'propose_change', { incident_id: 'INC-0001', target_version: '2.0.0' });
    const r = await refusal(d.delivery.callTool(engineer, 'apply_change', { change_id: 'CHG-0001' }));
    expect([r.layer, r.rule]).toEqual(['service', 'change_is_approved']);

    await d.delivery.callTool(await token('incident-manager'), 'approve_change', { change_id: 'CHG-0001' });
    const first: any = await d.delivery.callTool(engineer, 'apply_change', { change_id: 'CHG-0001' });
    const again: any = await d.delivery.callTool(engineer, 'apply_change', { change_id: 'CHG-0001' });
    expect([first.status, first.replayed]).toEqual(['applying', false]);
    expect([again.operation_id, again.replayed]).toEqual([first.operation_id, true]);
    const incident: any = await d.delivery.callTool(engineer, 'get_incident', { incident_id: 'INC-0001' });
    expect(incident.status).toBe('mitigating');
  });

  test('service rule: one open incident per service', async () => {
    const d = await seeded();
    const r = await refusal(
      d.delivery.callTool(await token('alert-automation'), 'open_incident', { service: 'search-service', severity: 'critical', summary: 's', impact: 'i' }),
    );
    expect([r.layer, r.rule]).toEqual(['service', 'one_open_incident_per_service']);
  });

  test('remediation-agent applies as the caller: applying, verifying, then resolved on the retained version', async () => {
    const d = await seeded();
    await d.delivery.callTool(await token('developer'), 'propose_change', { incident_id: 'INC-0001', target_version: '2.0.0' });
    await d.delivery.callTool(await token('incident-manager'), 'approve_change', { change_id: 'CHG-0001' });
    // A developer cannot get the agent to apply for them.
    expect((await refusal(d.remediation.applyAndVerify(await token('developer'), 'CHG-0001'))).layer).toBe('gateway');

    const reply = await d.remediation.applyAndVerify(await token('platform-engineer'), 'CHG-0001');
    expect(reply.data[0]).toMatchObject({ change_id: 'CHG-0001', status: 'applied', verified: true });
    const incident: any = await d.delivery.callTool(await token('developer'), 'get_incident', { incident_id: 'INC-0001' });
    expect(incident.status).toBe('resolved');
    expect(incident.changes.at(-1)).toMatchObject({ status: 'applied', applied_by: 'platform-engineer', target_version: '2.0.0' });
    expect(incident.changes.at(-1).history.map((h: any) => h.status)).toEqual(['proposed', 'approved', 'applying', 'verifying', 'applied']);
  });

  test('comms-agent drafts for the incident-manager and posts nothing', async () => {
    const d = await seeded();
    const before: any = await d.delivery.callTool(await token('developer'), 'get_incident', { incident_id: 'INC-0001' });
    const reply = await d.comms.draftStatusUpdate(await token('incident-manager'), 'INC-0001');
    expect(reply.text).toContain('INC-0001');
    const after: any = await d.delivery.callTool(await token('developer'), 'get_incident', { incident_id: 'INC-0001' });
    expect(after.status_updates).toEqual(before.status_updates);
    expect((await refusal(d.comms.draftStatusUpdate(await token('developer'), 'INC-0001'))).layer).toBe('gateway');
  });
});
