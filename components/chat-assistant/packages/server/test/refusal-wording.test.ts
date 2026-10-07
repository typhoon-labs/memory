import { describe, expect, test } from 'vitest';
import { performAction } from '../src/actions.js';
import { Refusal, refusalText, refusalWords, type Downstreams } from '../src/downstream/types.js';

describe('how a refusal is worded', () => {
  test("a rule of the service is said in plain words, with the rule's name after it", () => {
    const refusal = { layer: 'service' as const, rule: 'change_is_approved', detail: 'change CHG-0001 is proposed, not approved.' };
    expect(refusalText(refusal)).toBe('Refused by the service: this change has not been approved yet (rule change_is_approved).');
    // The card and the chat pane draw the same in three parts: who refused, why, and the rule.
    expect(refusalWords(refusal)).toEqual({ title: 'Refused by the service', reason: 'This change has not been approved yet.', rule: 'change_is_approved' });
  });

  test("a rule this code has no words for is shown with the service's own sentence", () => {
    const refusal = { layer: 'service' as const, rule: 'change_is_pending', detail: 'CHG-0001 is applied, not proposed.' };
    expect(refusalText(refusal)).toBe('Refused by the service: CHG-0001 is applied, not proposed (rule change_is_pending).');
    expect(refusalWords(refusal)).toEqual({ title: 'Refused by the service', reason: 'CHG-0001 is applied, not proposed.', rule: 'change_is_pending' });
  });

  test('a refusal by the gateway says so, with the HTTP status', () => {
    const refusal = { layer: 'gateway' as const, status: 403, detail: 'authorization failed' };
    expect(refusalText(refusal)).toBe('Refused by the gateway (HTTP 403): authorization failed');
    expect(refusalWords(refusal)).toEqual({ title: 'Refused by the gateway (HTTP 403)', reason: 'Authorization failed.' });
  });
});

describe('Apply on a change that is not approved', () => {
  const identity = { user: 'platform-engineer', roles: ['platform-engineer'], team: 'platform', token: 'the-callers-token' };
  const action = { name: 'apply_change', surfaceId: 'incident-INC-0001', sourceComponentId: 'apply', context: { incident_id: 'INC-0001', change_id: 'CHG-0001' } };

  test('goes to remediation-agent as the caller, like any apply, and comes back as the refusal the service gave', async () => {
    const calls: unknown[] = [];
    const downstreams = {
      remediation: {
        applyAndVerify: async (token: string, changeId: string) => {
          calls.push({ token, changeId });
          // What the agent relays when delivery-mcp says no.
          throw new Refusal({ layer: 'service', rule: 'change_is_approved', detail: 'change CHG-0001 is proposed, not approved.' });
        },
      },
    } as unknown as Downstreams;

    const outcome = await performAction(downstreams, identity, action);
    expect(calls).toEqual([{ token: 'the-callers-token', changeId: 'CHG-0001' }]);
    expect(outcome).toEqual({
      action: 'apply_change',
      ok: false,
      text: 'Refused by the service: this change has not been approved yet (rule change_is_approved).',
      refusal: {
        layer: 'service',
        rule: 'change_is_approved',
        status: undefined,
        message: 'change CHG-0001 is proposed, not approved.',
        title: 'Refused by the service',
        reason: 'This change has not been approved yet.',
      },
      incidentId: 'INC-0001',
    });
  });

  test('the action code makes no decision of its own: it never looks at the change before sending it', async () => {
    let asked = 0;
    const downstreams = {
      delivery: { callTool: async () => void asked++ },
      remediation: { applyAndVerify: async () => ({ text: 'CHG-0001 applied.', data: [] }) },
    } as unknown as Downstreams;
    const outcome = await performAction(downstreams, identity, action);
    expect(outcome.ok).toBe(true);
    expect(asked).toBe(0);
  });
});
