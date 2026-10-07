import { describe, expect, test } from 'vitest';
import { A2UI_VERSION, INCIDENT_CATALOG_ID } from '../src/a2a/wire.js';
import { ACTIONS, NOTICE_SLOT, NO_NOTICE, buildIncidentCard, progressSteps, type CardSurface } from '../src/card/incident-card.js';
import { normalizeIncident } from '../src/downstream/normalize.js';
import { newProcessor } from './support/a2ui.js';
import { CHANGE_STATUSES, VIEWERS, incidentWith } from './support/fixtures.js';

const get = (model: unknown, path: string) =>
  path
    .split('/')
    .filter(Boolean)
    .reduce<any>((node, key) => node?.[key], model);

const part = (card: CardSurface, id: string) => card.components.find((c) => c.id === id)!;
const children = (card: CardSurface, id: string) => part(card, id).children as string[];

/**
 * The card's server-action buttons and whether each is enabled, evaluating its
 * `checks` against a data model the way the renderer does.
 */
function buttons(card: CardSurface, model: unknown = card.model): Record<string, boolean> {
  const passes = (condition: any): boolean =>
    condition.path ? Boolean(get(model, condition.path)) : String(get(model, condition.args.value.path) ?? '').trim() !== '';
  return Object.fromEntries(
    card.components
      .filter((c) => c.component === 'Button' && (c.action as any)?.event)
      .map((c) => [c.id, ((c.checks as any[]) ?? []).every((check) => passes(check.condition))]),
  );
}
const enabled = (card: CardSurface, model?: unknown) =>
  Object.entries(buttons(card, model))
    .filter(([, on]) => on)
    .map(([id]) => id)
    .sort();

function render(card: CardSurface) {
  const a2ui = newProcessor();
  a2ui.apply([
    { version: A2UI_VERSION, createSurface: { surfaceId: card.surfaceId, catalogId: INCIDENT_CATALOG_ID, sendDataModel: true } },
    { version: A2UI_VERSION, updateComponents: { surfaceId: card.surfaceId, components: card.components } },
    { version: A2UI_VERSION, updateDataModel: { surfaceId: card.surfaceId, path: '/', value: card.model } },
  ]);
  return a2ui;
}

/** The buttons each role always has. */
const OFFERED: Record<string, string[]> = {
  developer: ['propose'],
  'incident-manager': ['approve', 'draft', 'post', 'reject'],
  'platform-engineer': ['apply', 'restart'],
};

/** Which of them are enabled for each change status (with nothing typed yet). */
const ENABLED: Record<string, Record<string, string[]>> = {
  developer: {
    none: ['propose'],
    proposed: [],
    approved: [],
    rejected: ['propose'],
    applying: [],
    verifying: [],
    applied: [],
    failed: ['propose'],
  },
  'incident-manager': {
    none: ['draft'],
    proposed: ['approve', 'draft'],
    approved: ['draft'],
    rejected: ['draft'],
    applying: ['draft'],
    verifying: ['draft'],
    applied: ['draft'],
    failed: ['draft'],
  },
  'platform-engineer': {
    none: ['restart'],
    // A proposed change can be sent for applying: the service decides, not the card.
    proposed: ['apply', 'restart'],
    approved: ['apply', 'restart'],
    rejected: ['restart'],
    applying: ['restart'],
    verifying: ['restart'],
    applied: [],
    failed: ['restart'],
  },
};

/** The step each role's controls sit on, and the change statuses in which that step draws them. */
const STEP_OF: Record<string, { step: string; open: string[] }> = {
  developer: { step: 'step-propose', open: ['none', 'rejected', 'failed'] },
  'incident-manager': { step: 'step-approve', open: ['proposed'] },
  'platform-engineer': { step: 'step-apply', open: ['proposed', 'approved'] },
};

describe('incident card: controls per role and per change status', () => {
  for (const [role, viewer] of Object.entries(VIEWERS)) {
    for (const status of CHANGE_STATUSES) {
      test(`${role} / change ${status}`, () => {
        const card = buildIncidentCard(incidentWith(status), viewer);
        expect(Object.keys(buttons(card)).sort()).toEqual(OFFERED[role]);
        expect(enabled(card)).toEqual(ENABLED[role]![status]);
        // The role's step draws its controls only while they apply, and marks the viewer's turn then.
        const { step, open } = STEP_OF[role]!;
        expect(part(card, step)).toMatchObject({ open: open.includes(status), turn: open.includes(status), you: true });
        // A2UI's own strict validation accepts the card.
        expect(() => render(card)).not.toThrow();
      });
    }
  }

  test('Reject also needs a reason, and Post needs a draft', () => {
    const card = buildIncidentCard(incidentWith('proposed'), VIEWERS['incident-manager']!);
    const typed = { ...card.model, reject: { reason: 'too risky' }, draft: { text: 'We are on it.' } };
    expect(enabled(card, typed)).toEqual(['approve', 'draft', 'post', 'reject']);
  });

  test('Apply is enabled whenever there is a proposed or approved change, and carries that change', () => {
    const engineer = VIEWERS['platform-engineer']!;
    const apply = (status: Parameters<typeof incidentWith>[0]) => {
      const card = buildIncidentCard(incidentWith(status), engineer);
      const button = part(card, 'apply');
      return {
        can: card.model.can.apply,
        label: part(card, button.child as string).text,
        changeId: (button.action as any).event.context.change_id,
        check: (button.checks as any[])[0],
        note: part(card, 'step-apply').note,
      };
    };
    // Proposed: enabled, with the change to apply. The card does not stand in for the service's rule.
    expect(apply('proposed')).toEqual({
      can: true,
      label: 'Apply rollback to 2.0.0',
      changeId: 'CHG-1',
      check: { condition: { path: '/can/apply' }, message: 'There is no change to apply yet' },
      note: 'Not approved yet',
    });
    expect(apply('approved')).toMatchObject({ can: true, changeId: 'CHG-1', note: 'Ready for you to apply' });
    // Nothing to apply: no change yet, or the last one was rejected or failed.
    for (const status of ['none', 'rejected', 'failed'] as const) {
      expect(apply(status)).toMatchObject({ can: false, label: 'Apply rollback', changeId: '', note: '' });
    }
    // Under way or done.
    expect(apply('applying')).toMatchObject({ can: false, changeId: '', check: { message: 'The rollback is already running' }, note: 'Rolling out 2.0.0' });
    expect(apply('applied')).toMatchObject({ can: false, check: { message: 'The incident is resolved' } });
  });

  test('who sees which button does not depend on the change: Apply is the platform-engineer\'s alone', () => {
    for (const status of CHANGE_STATUSES) {
      for (const role of ['developer', 'incident-manager']) {
        expect(Object.keys(buttons(buildIncidentCard(incidentWith(status), VIEWERS[role]!)))).not.toContain('apply');
      }
    }
  });

  test('every button has a notice beside it for what its action comes to', () => {
    for (const viewer of Object.values(VIEWERS)) {
      const card = buildIncidentCard(incidentWith('proposed'), viewer);
      const slots = card.components.filter((c) => c.component === 'Notice').map((c) => c.slot);
      for (const id of Object.keys(buttons(card))) {
        const action = (part(card, id).action as any).event.name;
        expect(slots).toContain(NOTICE_SLOT[action]);
      }
      // Each reads the viewer's one notice and is drawn while that notice names it.
      expect(part(card, `${slots[0]}-notice`)).toMatchObject({ active: { path: '/notice/slot' }, title: { path: '/notice/title' } });
      expect(card.model.notice).toEqual(NO_NOTICE);
    }
  });
});

describe('incident card: layout', () => {
  const undiagnosed = (overrides = {}) =>
    incidentWith('none', { evidence: [], suspected_cause: undefined, recommended_version: undefined, ...overrides });
  const running = { state: 'running' as const, since: '2026-10-06T09:14:03Z' };
  const failed = { state: 'failed' as const, at: '2026-10-06T09:15:03Z', message: 'diagnosis-agent: no answer within 60 seconds' };

  test('for one viewer the set of components is the same in every change status', () => {
    for (const viewer of Object.values(VIEWERS)) {
      const layouts = CHANGE_STATUSES.map((status) => JSON.stringify(buildIncidentCard(incidentWith(status), viewer).layout));
      expect(new Set(layouts).size).toBe(1);
    }
  });

  test('so moving through the statuses is an in-place update that leaves no orphan behind (strict A2UI validation)', () => {
    for (const viewer of Object.values(VIEWERS)) {
      const first = buildIncidentCard(incidentWith('none'), viewer);
      const a2ui = render(first);
      for (const status of CHANGE_STATUSES.slice(1)) {
        const next = buildIncidentCard(incidentWith(status), viewer);
        expect(() =>
          a2ui.apply([{ version: A2UI_VERSION, updateComponents: { surfaceId: next.surfaceId, components: next.components } }]),
        ).not.toThrow();
      }
    }
  });

  test('the diagnosis arriving only adds components, so it too is an in-place update', () => {
    for (const viewer of Object.values(VIEWERS)) {
      const before = buildIncidentCard(undiagnosed(), viewer, running);
      const after = buildIncidentCard(incidentWith('none'), viewer);
      expect(after.layout.length).toBeGreaterThan(before.layout.length);
      expect(before.layout.filter((entry) => !after.layout.includes(entry))).toEqual([]);
      const a2ui = render(before);
      expect(() =>
        a2ui.apply([{ version: A2UI_VERSION, updateComponents: { surfaceId: after.surfaceId, components: after.components } }]),
      ).not.toThrow();
    }
  });

  test('a new timeline entry fills a row in or adds one: an in-place update', () => {
    const at = (minute: number) => `2026-10-06T09:${minute}:00Z`;
    const entries = Array.from({ length: 8 }, (_, i) => ({ at: at(14 + i), text: `Entry ${i + 1}` }));
    const withEntries = (n: number) => buildIncidentCard(incidentWith('none', { timeline: entries.slice(0, n) }), VIEWERS.developer!);
    const a2ui = render(withEntries(0));
    expect(part(withEntries(0), 'timeline-0-text').text).toBe('Nothing recorded yet.');
    for (let n = 1; n <= entries.length; n++) {
      const next = withEntries(n);
      expect(withEntries(n - 1).layout.filter((entry) => !next.layout.includes(entry))).toEqual([]);
      expect(() => a2ui.apply([{ version: A2UI_VERSION, updateComponents: { surfaceId: next.surfaceId, components: next.components } }])).not.toThrow();
    }
    // The newest six are shown, a time and a text each.
    const last = withEntries(8);
    expect(children(last, 'timeline')).toHaveLength(6);
    expect([part(last, 'timeline-0-at').text, part(last, 'timeline-0-text').text]).toEqual(['09:16', 'Entry 3']);
    expect(part(last, 'timeline-5-text').text).toBe('Entry 8');
  });

  test('the controls sit on the steps, above the cause, its evidence and the timeline, so they need no scrolling however long those are', () => {
    const card = buildIncidentCard(incidentWith('none'), VIEWERS.developer!);
    const root = children(card, 'root');
    for (const below of ['cause', 'evidence', 'timeline']) expect(root.indexOf('steps')).toBeLessThan(root.indexOf(below));
    expect(children(card, 'steps')).toEqual(['step-propose', 'step-approve', 'step-apply', 'step-verify', 'step-resolve']);
    expect(children(card, part(card, 'step-propose').child as string)).toContain('propose');
  });

  test("the card's own list of children is the same with and without a diagnosis: only the evidence list fills in", () => {
    const before = buildIncidentCard(undiagnosed(), VIEWERS.developer!, running);
    const after = buildIncidentCard(incidentWith('none'), VIEWERS.developer!);
    expect(children(before, 'root')).toEqual(children(after, 'root'));
    expect(children(before, 'propose-controls')).toEqual(children(after, 'propose-controls'));
    expect(children(before, 'evidence')).toEqual([]);
    expect(children(after, 'evidence')).toEqual(['evidence-0', 'evidence-1']);
  });

  describe('while there is no diagnosis', () => {
    test('running: the card says it is diagnosing and Propose waits', () => {
      const card = buildIncidentCard(undiagnosed(), VIEWERS.developer!, running);
      expect(part(card, 'cause').text).toBe('Diagnosing… The diagnosis agent started at 09:14:03 UTC. A diagnosis usually takes 10 to 20 seconds.');
      // The step shows the button, disabled, and says what it is waiting for. It is not the viewer's turn yet.
      expect(part(card, 'step-propose')).toMatchObject({ note: 'Waiting for the diagnosis', busy: true, open: true, turn: false });
      expect(part(card, 'change-id').text).toBe('No version recommended yet');
      expect(enabled(card)).toEqual([]);
      expect(() => render(card)).not.toThrow();
    });

    test('failed: the card says so, and the developer can name the version by hand', () => {
      const card = buildIncidentCard(undiagnosed(), VIEWERS.developer!, failed);
      expect(part(card, 'cause').text).toBe('Diagnosis failed: diagnosis-agent: no answer within 60 seconds. No version is recommended.');
      expect(part(card, 'step-propose')).toMatchObject({ note: 'No version is recommended', busy: false, open: true, turn: true });
      expect(part(card, 'propose-version')).toMatchObject({ component: 'TextField', value: { path: '/propose/version' } });
      expect((part(card, 'propose').action as any).event.context.target_version).toEqual({ path: '/propose/version' });
      expect(enabled(card)).toEqual([]);
      expect(enabled(card, { ...card.model, propose: { version: '2.0.0' } })).toEqual(['propose']);
      expect(() => render(card)).not.toThrow();
    });

    test('failed: the other roles keep the actions that need no diagnosis', () => {
      expect(enabled(buildIncidentCard(undiagnosed(), VIEWERS['incident-manager']!, failed))).toEqual(['draft']);
      expect(enabled(buildIncidentCard(undiagnosed(), VIEWERS['platform-engineer']!, failed))).toEqual(['restart']);
    });

    test('unknown (nothing noted, for example after a restart): the same choices as failed, without a reason', () => {
      const card = buildIncidentCard(undiagnosed(), VIEWERS.developer!);
      expect(part(card, 'cause').text).toBe('No diagnosis recorded yet.');
      expect(card.components.some((c) => c.id === 'propose-version')).toBe(true);
    });
  });
});

describe('incident card: content', () => {
  test('everyone sees the same incident and the same steps; only the controls differ', () => {
    const SHARED = ['title', 'status', 'severity', 'service', 'incident-id', 'impact', 'change-heading', 'change-id', 'cause', 'evidence', 'timeline'];
    const seen = Object.values(VIEWERS).map((viewer) => {
      const card = buildIncidentCard(incidentWith('proposed'), viewer);
      const steps = children(card, 'steps').map((id) => {
        const { label, state, owner, ownerRole, time } = part(card, id);
        return { id, label, state, owner, ownerRole, time };
      });
      return JSON.stringify([SHARED.map((id) => part(card, id)), steps]);
    });
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]).toContain('Search requests are failing');
  });

  test('shows status, severity, service, impact numbers, the change, who did each step, the cause and a timeline', () => {
    const incident = incidentWith('approved');
    incident.change!.at = { proposed: '2026-10-06T09:16:00Z', approved: '2026-10-06T09:18:30Z' };
    const card = buildIncidentCard(incident, VIEWERS.developer!);
    expect(part(card, 'status')).toMatchObject({ component: 'Badge', text: 'Open', tone: 'red', icon: 'dot' });
    expect(part(card, 'severity')).toMatchObject({ component: 'Badge', text: 'Critical', tone: 'red', icon: 'bars' });
    const texts = card.components.filter((c) => c.component === 'Text').map((c) => String(c.text));
    for (const expected of ['search-service, running 2.1.0', 'INC-1', '100%', '412', 'search-service 2.1.0 fails every request.', 'Rollback to 2.0.0', 'CHG-1']) {
      expect(texts).toContain(expected);
    }
    expect(part(card, 'step-propose')).toMatchObject({ label: 'Proposed', state: 'done', owner: 'developer', ownerRole: 'developer', you: true, time: '09:16' });
    expect(part(card, 'step-approve')).toMatchObject({ label: 'Approved', state: 'done', owner: 'incident-manager', you: false, time: '09:18' });
    expect(part(card, 'step-apply')).toMatchObject({ label: 'Apply', state: 'pending', owner: 'platform-engineer', note: 'Ready to apply', time: '' });
    expect(part(card, 'step-verify')).toMatchObject({ label: 'Verify', owner: 'remediation-agent' });
    expect(part(card, 'step-resolve')).toMatchObject({ label: 'Resolved', state: 'pending', closes: true, owner: '' });
    expect([part(card, 'timeline-0-at').text, part(card, 'timeline-0-text').text]).toEqual(['09:14', 'Incident opened by alert-automation']);
  });

  test('the status badge is red while open, amber while being mitigated and green once resolved; only a critical severity is red', () => {
    const badge = (overrides: object, id: string) => {
      const { text, tone, icon } = part(buildIncidentCard(incidentWith('none', overrides), VIEWERS.developer!), id);
      return [text, tone, icon];
    };
    expect(badge({ status: 'open' }, 'status')).toEqual(['Open', 'red', 'dot']);
    expect(badge({ status: 'mitigating' }, 'status')).toEqual(['Mitigating', 'amber', 'dot']);
    expect(badge({ status: 'resolved' }, 'status')).toEqual(['Resolved', 'green', 'check']);
    expect(badge({ severity: 'critical' }, 'severity')).toEqual(['Critical', 'red', 'bars']);
    expect(badge({ severity: 'warning' }, 'severity')).toEqual(['Warning', 'neutral', 'bars']);
  });

  test('a rejected change says who rejected it and why, on the step', () => {
    const card = buildIncidentCard(incidentWith('rejected'), VIEWERS.developer!);
    expect(part(card, 'step-approve')).toMatchObject({ label: 'Rejected', state: 'failed', owner: 'incident-manager', note: 'Try a restart first' });
  });

  test('evidence with an http(s) link opens it with the catalog function openUrl; other evidence is text', () => {
    const card = buildIncidentCard(incidentWith('none'), VIEWERS.developer!);
    const link = part(card, 'evidence-0');
    expect(link.component).toBe('Button');
    expect(link.action).toEqual({ functionCall: { call: 'openUrl', args: { url: 'http://localhost:18084/d/search-errors' }, returnType: 'void' } });
    expect(part(card, 'evidence-1').component).toBe('Text');
    // A link that is not http(s) is never turned into a button.
    const hostile = normalizeIncident({ incident_id: 'INC-9', evidence: [{ label: 'click me', url: 'javascript:alert(1)' }] });
    expect(hostile.evidence).toEqual([{ label: 'click me' }]);
  });

  test('the developer button names the recommended version and carries it in the action context', () => {
    const card = buildIncidentCard(incidentWith('none'), VIEWERS.developer!);
    const propose = part(card, 'propose');
    expect(part(card, propose.child as string).text).toBe('Propose rollback to 2.0.0');
    expect((propose.action as any).event).toEqual({ name: ACTIONS.propose, context: { incident_id: 'INC-1', target_version: '2.0.0' } });
    expect(part(card, 'step-propose').note).toBe('The diagnosis recommends 2.0.0');
    expect(part(card, 'change-id').text).toBe('Not proposed yet');
  });

  test('button contexts take what the viewer typed from the data model', () => {
    const manager = buildIncidentCard(incidentWith('proposed'), VIEWERS['incident-manager']!);
    const context = (id: string) => (part(manager, id).action as any).event.context;
    expect(context('approve')).toEqual({ incident_id: 'INC-1', change_id: 'CHG-1' });
    expect(context('reject')).toEqual({ incident_id: 'INC-1', change_id: 'CHG-1', reason: { path: '/reject/reason' } });
    expect(context('post')).toEqual({ incident_id: 'INC-1', text: { path: '/draft/text' } });
    expect(part(manager, 'step-approve').note).toBe('Waiting for you');
  });

  test('a user with two roles gets the controls of both; an unknown role gets none', () => {
    const both = buildIncidentCard(incidentWith('proposed'), { user: 'x', roles: ['developer', 'incident-manager'] });
    expect(Object.keys(buttons(both)).sort()).toEqual(['approve', 'draft', 'post', 'propose', 'reject']);
    const none = buildIncidentCard(incidentWith('proposed'), { user: 'bot', roles: ['alert-automation'] });
    expect(buttons(none)).toEqual({});
    expect(none.components.some((c) => c.id === 'no-actions')).toBe(true);
    expect(none.components.some((c) => c.component === 'Step' && c.child)).toBe(false);
    expect(() => render(none)).not.toThrow();
  });

  test('the version changes with what the viewer sees, and only then', () => {
    const v = (status: any, role = 'developer') => buildIncidentCard(incidentWith(status), VIEWERS[role]!).version;
    expect(v('proposed')).toBe(v('proposed'));
    expect(v('proposed')).not.toBe(v('approved'));
    expect(v('proposed', 'developer')).not.toBe(v('proposed', 'incident-manager'));
  });
});

describe('progress through applying, verifying, resolved', () => {
  const marks = (status: any, at?: Record<string, string>) => {
    const incident = incidentWith(status);
    if (at) incident.change!.at = at;
    return progressSteps(incident).map((s) => `${s.state}:${s.label}`);
  };
  test('each status, with each step named in the tense of its state', () => {
    expect(marks('none')).toEqual(['pending:Propose', 'pending:Approve', 'pending:Apply', 'pending:Verify', 'pending:Resolved']);
    expect(marks('proposed')).toEqual(['done:Proposed', 'pending:Approve', 'pending:Apply', 'pending:Verify', 'pending:Resolved']);
    expect(marks('approved')).toEqual(['done:Proposed', 'done:Approved', 'pending:Apply', 'pending:Verify', 'pending:Resolved']);
    expect(marks('applying')).toEqual(['done:Proposed', 'done:Approved', 'current:Applying', 'pending:Verify', 'pending:Resolved']);
    expect(marks('verifying')).toEqual(['done:Proposed', 'done:Approved', 'done:Applied', 'current:Verifying', 'pending:Resolved']);
    expect(marks('applied')).toEqual(['done:Proposed', 'done:Approved', 'done:Applied', 'done:Verified', 'done:Resolved']);
    expect(marks('rejected')).toEqual(['done:Proposed', 'failed:Rejected', 'pending:Apply', 'pending:Verify', 'pending:Resolved']);
    expect(marks('failed')).toEqual(['done:Proposed', 'done:Approved', 'failed:Apply failed', 'pending:Verify', 'pending:Resolved']);
  });

  test('a change that fails after it was rolled out failed its verification', () => {
    expect(marks('failed', { verifying: '2026-10-06T09:20:00Z', failed: '2026-10-06T09:21:00Z' })).toEqual([
      'done:Proposed',
      'done:Approved',
      'done:Applied',
      'failed:Not verified',
      'pending:Resolved',
    ]);
  });

  test('the card shows them as five steps', () => {
    const card = buildIncidentCard(incidentWith('verifying'), VIEWERS.developer!);
    const steps = children(card, 'steps').map((id) => `${part(card, id).state}:${part(card, id).label}`);
    expect(steps).toEqual(['done:Proposed', 'done:Approved', 'done:Applied', 'current:Verifying', 'pending:Resolved']);
    expect(part(card, 'step-verify').note).toBe('Checking that the rollback worked');
  });
});
