import { describe, expect, test } from 'vitest';
import { A2UI_VERSION, BASIC_CATALOG_ID } from '../src/a2a/wire.js';
import { ACTIONS, buildIncidentCard, progressSteps, type CardSurface } from '../src/card/incident-card.js';
import { normalizeIncident } from '../src/downstream/normalize.js';
import { newProcessor } from './support/a2ui.js';
import { CHANGE_STATUSES, VIEWERS, incidentWith } from './support/fixtures.js';

const get = (model: unknown, path: string) =>
  path
    .split('/')
    .filter(Boolean)
    .reduce<any>((node, key) => node?.[key], model);

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
    { version: A2UI_VERSION, createSurface: { surfaceId: card.surfaceId, catalogId: BASIC_CATALOG_ID, sendDataModel: true } },
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
    proposed: ['restart'],
    approved: ['apply', 'restart'],
    rejected: ['restart'],
    applying: ['restart'],
    verifying: ['restart'],
    applied: [],
    failed: ['restart'],
  },
};

describe('incident card: action row per role and per change status', () => {
  for (const [role, viewer] of Object.entries(VIEWERS)) {
    for (const status of CHANGE_STATUSES) {
      test(`${role} / change ${status}`, () => {
        const card = buildIncidentCard(incidentWith(status), viewer);
        expect(Object.keys(buttons(card)).sort()).toEqual(OFFERED[role]);
        expect(enabled(card)).toEqual(ENABLED[role]![status]);
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

  test('Apply is enabled only once approved: its check is bound to /can/apply', () => {
    const card = buildIncidentCard(incidentWith('proposed'), VIEWERS['platform-engineer']!);
    expect(card.components.find((c) => c.id === 'apply')!.checks).toEqual([
      { condition: { path: '/can/apply' }, message: 'Waiting for an incident-manager to approve' },
    ]);
    expect(card.model.can.apply).toBe(false);
    expect(buildIncidentCard(incidentWith('approved'), VIEWERS['platform-engineer']!).model.can.apply).toBe(true);
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

  test('the actions come before the cause, its evidence and the timeline, so they need no scrolling however long those are', () => {
    const body = buildIncidentCard(incidentWith('none'), VIEWERS.developer!).components.find((c) => c.id === 'body')!.children as string[];
    expect(body.indexOf('propose')).toBeGreaterThan(body.indexOf('progress'));
    for (const below of ['cause', 'evidence', 'timeline']) expect(body.indexOf('propose')).toBeLessThan(body.indexOf(below));
  });

  test("the body's own list of children is the same with and without a diagnosis: only the evidence list fills in", () => {
    const children = (card: CardSurface, id: string) => card.components.find((c) => c.id === id)!.children as string[];
    const before = buildIncidentCard(undiagnosed(), VIEWERS.developer!, running);
    const after = buildIncidentCard(incidentWith('none'), VIEWERS.developer!);
    expect(children(before, 'body')).toEqual(children(after, 'body'));
    expect(children(before, 'evidence')).toEqual([]);
    expect(children(after, 'evidence')).toEqual(['evidence-0', 'evidence-1']);
  });

  describe('while there is no diagnosis', () => {
    test('running: the card says it is diagnosing and Propose waits', () => {
      const card = buildIncidentCard(undiagnosed(), VIEWERS.developer!, running);
      expect(card.components.find((c) => c.id === 'cause')!.text).toBe(
        'Diagnosing… The diagnosis agent started at 09:14:03 UTC. A diagnosis usually takes 10 to 20 seconds.',
      );
      expect(card.components.find((c) => c.id === 'developer-note')!.text).toBe(
        'The diagnosis is running. Propose is enabled once it recommends a version.',
      );
      expect(enabled(card)).toEqual([]);
      expect(() => render(card)).not.toThrow();
    });

    test('failed: the card says so, and the developer can name the version by hand', () => {
      const card = buildIncidentCard(undiagnosed(), VIEWERS.developer!, failed);
      expect(card.components.find((c) => c.id === 'cause')!.text).toBe(
        'Diagnosis failed: diagnosis-agent: no answer within 60 seconds. No version is recommended.',
      );
      expect(card.components.find((c) => c.id === 'propose-version')).toMatchObject({ component: 'TextField', value: { path: '/propose/version' } });
      expect((card.components.find((c) => c.id === 'propose')!.action as any).event.context.target_version).toEqual({ path: '/propose/version' });
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
      expect(card.components.find((c) => c.id === 'cause')!.text).toBe('No diagnosis recorded yet.');
      expect(card.components.some((c) => c.id === 'propose-version')).toBe(true);
    });
  });
});

describe('incident card: content', () => {
  test('the body is the same for every role; only the action row differs', () => {
    const bodies = Object.values(VIEWERS).map((viewer) => {
      const card = buildIncidentCard(incidentWith('proposed'), viewer);
      const body = card.components.find((c) => c.id === 'body')!.children as string[];
      // Everything except the action section, which sits between the change and the cause.
      const shared = [...body.slice(0, body.indexOf('divider-actions')), ...body.slice(body.indexOf('divider-cause'))];
      return JSON.stringify(shared.map((id) => card.components.find((c) => c.id === id)));
    });
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toContain('Search requests are failing');
  });

  test('shows service, severity, impact numbers, cause, evidence, the change and a timeline', () => {
    const card = buildIncidentCard(incidentWith('approved'), VIEWERS.developer!);
    const texts = card.components.filter((c) => c.component === 'Text').map((c) => String(c.text));
    for (const expected of ['search-service', 'critical', '100%', '412', 'search-service 2.1.0 fails every request.', 'Change status: approved']) {
      expect(texts).toContain(expected);
    }
    expect(
      texts.some((t) => t.includes('Roll back search-service to 2.0.0') && t.includes('proposed by developer') && t.includes('approved by incident-manager')),
    ).toBe(true);
    expect(card.components.find((c) => c.id === 'timeline')!.text).toBe('- 09:14 Incident opened by alert-automation');
  });

  test('evidence with an http(s) link opens it with the catalog function openUrl; other evidence is text', () => {
    const card = buildIncidentCard(incidentWith('none'), VIEWERS.developer!);
    const link = card.components.find((c) => c.id === 'evidence-0')!;
    expect(link.component).toBe('Button');
    expect(link.action).toEqual({ functionCall: { call: 'openUrl', args: { url: 'http://localhost:18084/d/search-errors' }, returnType: 'void' } });
    expect(card.components.find((c) => c.id === 'evidence-1')!.component).toBe('Text');
    // A link that is not http(s) is never turned into a button.
    const hostile = normalizeIncident({ incident_id: 'INC-9', evidence: [{ label: 'click me', url: 'javascript:alert(1)' }] });
    expect(hostile.evidence).toEqual([{ label: 'click me' }]);
  });

  test('the developer button names the recommended version and carries it in the action context', () => {
    const card = buildIncidentCard(incidentWith('none'), VIEWERS.developer!);
    const propose = card.components.find((c) => c.id === 'propose')!;
    expect(card.components.find((c) => c.id === propose.child)!.text).toBe('Propose rollback to 2.0.0');
    expect((propose.action as any).event).toEqual({ name: ACTIONS.propose, context: { incident_id: 'INC-1', target_version: '2.0.0' } });
  });

  test('button contexts take what the viewer typed from the data model', () => {
    const manager = buildIncidentCard(incidentWith('proposed'), VIEWERS['incident-manager']!);
    const context = (id: string) => (manager.components.find((c) => c.id === id)!.action as any).event.context;
    expect(context('approve')).toEqual({ incident_id: 'INC-1', change_id: 'CHG-1' });
    expect(context('reject')).toEqual({ incident_id: 'INC-1', change_id: 'CHG-1', reason: { path: '/reject/reason' } });
    expect(context('post')).toEqual({ incident_id: 'INC-1', text: { path: '/draft/text' } });
  });

  test('a user with two roles gets both rows; an unknown role gets none', () => {
    const both = buildIncidentCard(incidentWith('proposed'), { user: 'x', roles: ['developer', 'incident-manager'] });
    expect(Object.keys(buttons(both)).sort()).toEqual(['approve', 'draft', 'post', 'propose', 'reject']);
    const none = buildIncidentCard(incidentWith('proposed'), { user: 'bot', roles: ['alert-automation'] });
    expect(buttons(none)).toEqual({});
    expect(none.components.some((c) => c.id === 'no-actions')).toBe(true);
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
  const marks = (status: any) => progressSteps(incidentWith(status)).map((s) => `${s.state}:${s.label}`);
  test('each status', () => {
    expect(marks('none')).toEqual(['pending:Proposed', 'pending:Approved', 'pending:Applying', 'pending:Verifying', 'pending:Resolved']);
    expect(marks('proposed')).toEqual(['done:Proposed', 'pending:Approved', 'pending:Applying', 'pending:Verifying', 'pending:Resolved']);
    expect(marks('approved')).toEqual(['done:Proposed', 'done:Approved', 'pending:Applying', 'pending:Verifying', 'pending:Resolved']);
    expect(marks('applying')).toEqual(['done:Proposed', 'done:Approved', 'current:Applying', 'pending:Verifying', 'pending:Resolved']);
    expect(marks('verifying')).toEqual(['done:Proposed', 'done:Approved', 'done:Applying', 'current:Verifying', 'pending:Resolved']);
    expect(marks('applied')).toEqual(['done:Proposed', 'done:Approved', 'done:Applying', 'done:Verifying', 'done:Resolved']);
    expect(marks('rejected')).toEqual(['done:Proposed', 'failed:Rejected', 'pending:Applying', 'pending:Verifying', 'pending:Resolved']);
    expect(marks('failed')).toEqual(['done:Proposed', 'done:Approved', 'failed:Apply failed', 'pending:Verifying', 'pending:Resolved']);
  });

  test('the card shows them as five marked steps', () => {
    const card = buildIncidentCard(incidentWith('verifying'), VIEWERS.developer!);
    const steps = [0, 1, 2, 3, 4].map((i) => card.components.find((c) => c.id === `progress-${i}`)!.text);
    expect(steps).toEqual(['✓ Proposed', '✓ Approved', '✓ Applying', '● Verifying', '○ Resolved']);
  });
});
