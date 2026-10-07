/**
 * The incident card, built by code from `get_incident`. No model is involved.
 * Its components are A2UI's basic catalog (v0.9.1) and the four of the
 * incident catalog: Steps, Step, Badge and Notice
 * (packages/ui/src/incident-catalog.ts).
 *
 * The middle of the card is the change's five steps. Each step names the role
 * that owns it, and a viewer's controls sit on the step their role performs,
 * so everyone sees the same steps and only the controls differ. Which controls
 * are shown or enabled is presentation only: whether an action is allowed is
 * decided by the gateway and by delivery-mcp when it is sent.
 *
 * Layout rule: as an incident moves on, components are added but never taken
 * away. A2UI's `updateComponents` adds or updates components and cannot remove
 * one, so a control that does not apply is disabled (a `checks` rule bound to
 * the data model under `/can`) and its step stops drawing it (`open`), rather
 * than left out. Every step of an incident, including the diagnosis arriving,
 * is then an update in place: nothing is left behind, and a button a viewer is
 * about to press is not replaced under them.
 */
import { createHash } from 'node:crypto';
import type { DiagnosisStatus } from '../diagnosis-status.js';
import type { Incident } from '../downstream/types.js';

export interface Viewer {
  user: string;
  roles: string[];
  team?: string;
}

/** One catalog component: `id`, `component`, then that component's properties. */
export type Component = { id: string; component: string } & Record<string, unknown>;

/** Which of the viewer's buttons are enabled. Bound from the buttons' `checks`. */
export interface Can {
  propose: boolean;
  approve: boolean;
  apply: boolean;
  restart: boolean;
}

/**
 * What the viewer's last action came to, when it was refused or failed. `slot`
 * names the controls it belongs to; the Notice beside those controls draws it.
 */
export interface Notice {
  slot: string;
  /** Who said no, `gateway` or `service`; `failed` for anything else. */
  tone: string;
  title: string;
  text: string;
  rule: string;
}

export const NO_NOTICE: Notice = { slot: '', tone: '', title: '', text: '', rule: '' };

export interface CardSurface {
  surfaceId: string;
  incidentId: string;
  /** Changes whenever what this viewer should see changes. */
  version: string;
  /**
   * Every component as `id:Type`, sorted. A client whose components are all in
   * this list can be updated in place; otherwise the surface is rebuilt.
   */
  layout: string[];
  components: Component[];
  /** Initial data model. `reject`, `draft`, `propose` and `notice` belong to the viewer afterward. */
  model: {
    meta: { version: string; layout: string[]; incidentId: string };
    can: Can;
    reject: { reason: string };
    draft: { text: string };
    propose: { version: string };
    notice: Notice;
  };
}

export const ACTIONS = {
  propose: 'propose_rollback',
  approve: 'approve_change',
  reject: 'reject_change',
  apply: 'apply_change',
  restart: 'restart_workload',
  draft: 'draft_status_update',
  post: 'post_status_update',
} as const;

/** The Notice an action's outcome is shown in: the one beside the button that was pressed. */
export const NOTICE_SLOT: Record<string, string> = {
  [ACTIONS.propose]: 'propose',
  [ACTIONS.approve]: 'approve',
  [ACTIONS.reject]: 'approve',
  [ACTIONS.apply]: 'apply',
  [ACTIONS.restart]: 'restart',
  [ACTIONS.draft]: 'update',
  [ACTIONS.post]: 'update',
};

const KNOWN_ROLES = ['developer', 'incident-manager', 'platform-engineer'];
const IN_FLIGHT = ['applying', 'verifying'];
const ACTIVE = ['proposed', 'approved', ...IN_FLIGHT];
const TIMELINE_ENTRIES = 6;

export function surfaceIdFor(incidentId: string): string {
  return `incident-${incidentId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

export type StepKey = 'propose' | 'approve' | 'apply' | 'verify' | 'resolve';
export type StepState = 'done' | 'current' | 'failed' | 'pending';

/** Each step's name before it starts, while it runs and once it is done. */
const STEP_NAMES: Record<StepKey, [pending: string, current: string, done: string]> = {
  propose: ['Propose', 'Proposing', 'Proposed'],
  approve: ['Approve', 'Approving', 'Approved'],
  apply: ['Apply', 'Applying', 'Applied'],
  verify: ['Verify', 'Verifying', 'Verified'],
  resolve: ['Resolved', 'Resolved', 'Resolved'],
};
const STEPS = Object.keys(STEP_NAMES) as StepKey[];

/** The five steps of a change, each done, in progress, failed or pending, and named in that tense. */
export function progressSteps(incident: Incident): { key: StepKey; label: string; state: StepState }[] {
  const change = incident.change;
  const status = change?.status;
  const reached = status ? ['proposed', 'approved', 'applying', 'verifying', 'applied'].indexOf(status) : -1;
  const resolved = incident.status === 'resolved' || status === 'applied';
  // A change fails while it is applied or while it is verified; its history says which.
  const failedAt = status === 'rejected' ? 1 : status === 'failed' ? (change?.at?.verifying ? 3 : 2) : -1;
  const FAILED: Partial<Record<StepKey, string>> = { approve: 'Rejected', apply: 'Apply failed', verify: 'Not verified' };

  return STEPS.map((key, i) => {
    let state: StepState;
    if (resolved) state = 'done';
    else if (failedAt >= 0) state = i < failedAt ? 'done' : i === failedAt ? 'failed' : 'pending';
    else if (i < reached) state = 'done';
    else if (i === reached) state = IN_FLIGHT.includes(status!) ? 'current' : 'done';
    else state = 'pending';
    const [pending, current, done] = STEP_NAMES[key];
    const label = state === 'failed' ? FAILED[key]! : state === 'done' ? done : state === 'current' ? current : pending;
    return { key, label, state };
  });
}

/** A time of day in UTC, as `HH:MM` or `HH:MM:SS`; empty for no time or one that cannot be read. */
export function clock(at: string | undefined, seconds = false): string {
  if (!at) return '';
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(11, seconds ? 19 : 16);
}

const capitalized = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

const STATUS_BADGE: Record<string, { tone: string; icon: string }> = {
  open: { tone: 'red', icon: 'dot' },
  mitigating: { tone: 'amber', icon: 'dot' },
  resolved: { tone: 'green', icon: 'check' },
};

/**
 * @param diagnosis where the alert hook's diagnosis stands, while the incident record has none
 */
export function buildIncidentCard(incident: Incident, viewer: Viewer, diagnosis?: DiagnosisStatus): CardSurface {
  const components: Component[] = [];
  const add = (c: Component) => {
    components.push(c);
    return c.id;
  };
  const text = (id: string, value: unknown, variant = 'body', extra: Record<string, unknown> = {}) =>
    add({ id, component: 'Text', text: value, variant, ...extra });
  const column = (id: string, children: string[], extra: Record<string, unknown> = {}) =>
    add({ id, component: 'Column', children, ...extra });
  const row = (id: string, children: string[], extra: Record<string, unknown> = {}) =>
    add({ id, component: 'Row', children, ...extra });
  const badge = (id: string, value: string, tone: string, icon: string) => add({ id, component: 'Badge', text: value, tone, icon });
  const button = (id: string, label: string, action: unknown, extra: Record<string, unknown> = {}) =>
    add({ id, component: 'Button', child: text(`${id}-label`, label), action, ...extra });
  // Drawn beside the controls it names, and only while the viewer's last action there was refused or failed.
  const notice = (slot: string) =>
    add({
      id: `${slot}-notice`,
      component: 'Notice',
      slot,
      active: { path: '/notice/slot' },
      tone: { path: '/notice/tone' },
      title: { path: '/notice/title' },
      text: { path: '/notice/text' },
      rule: { path: '/notice/rule' },
    });
  const event = (name: string, context: Record<string, unknown>) => ({ event: { name, context } });
  const enabledWhen = (path: string, message: string) => ({ condition: { path }, message });
  const filled = (path: string, message: string) => ({
    condition: { call: 'required', args: { value: { path } }, returnType: 'boolean' },
    message,
  });

  const change = incident.change;
  const status = change?.status;
  const resolved = incident.status === 'resolved';
  const active = change && ACTIVE.includes(change.status) ? change : undefined;
  const inFlight = !!status && IN_FLIGHT.includes(status);
  const recommended = incident.recommended_version;
  const diagnosing = !incident.suspected_cause && diagnosis?.state === 'running';
  const roles = viewer.roles.filter((r) => KNOWN_ROLES.includes(r));
  const has = (role: string) => roles.includes(role);
  const ctx = { incident_id: incident.id };

  // A new change can be proposed while none is under way: at the start, and after a rejection or a failure.
  const proposable = !resolved && !active && status !== 'applied';
  const can: Can = {
    // With no recommendation and no diagnosis running, the developer may name the version themselves.
    propose: proposable && (!!recommended || !diagnosing),
    approve: status === 'proposed',
    // A proposed change can be sent for applying too. Whether it is applied is delivery-mcp's rule
    // (`change_is_approved`), and the card shows the service's refusal rather than pre-empting it.
    apply: status === 'proposed' || status === 'approved',
    restart: !resolved,
  };

  const body: string[] = [];

  // --- The incident: the same for every viewer, but for the engineer's Restart ---
  const head = [text('title', incident.summary || `${incident.service} incident`, 'h3', { weight: 1 })];
  if (has('platform-engineer')) {
    head.push(
      button('restart', `Restart ${incident.service}`, event(ACTIONS.restart, { ...ctx, service: incident.service }), {
        checks: [enabledWhen('/can/restart', 'The incident is resolved')],
      }),
    );
  }
  body.push(row('head', head, { align: 'start' }));

  const statusBadge = STATUS_BADGE[incident.status] ?? { tone: 'neutral', icon: 'dot' };
  body.push(
    row(
      'meta',
      [
        badge('status', capitalized(incident.status), statusBadge.tone, statusBadge.icon),
        badge('severity', capitalized(incident.severity), incident.severity === 'critical' ? 'red' : 'neutral', 'bars'),
        text('service', `${incident.service}${incident.current_version ? `, running ${incident.current_version}` : ''}`, 'caption'),
        text('incident-id', incident.id, 'caption'),
      ],
      { align: 'center' },
    ),
  );

  if (typeof incident.impact === 'string') {
    body.push(text('impact', incident.impact || 'No impact recorded.'));
  } else {
    body.push(
      row(
        'impact',
        Object.entries(incident.impact).map(([label, value], i) =>
          column(`impact-${i}`, [text(`impact-${i}-value`, String(value), 'h4'), text(`impact-${i}-label`, label, 'caption')], { weight: 1 }),
        ),
      ),
    );
  }
  if (has('platform-engineer')) body.push(notice('restart'));

  // --- The change: five steps, the viewer's controls on the steps their roles perform ---
  const target = change?.target_version || recommended;
  body.push(
    row(
      'change-head',
      [
        text('change-heading', target ? `Rollback to ${target}` : 'Rollback', 'h5'),
        text('change-id', change ? change.id : recommended ? 'Not proposed yet' : 'No version recommended yet', 'caption'),
      ],
      { justify: 'spaceBetween', align: 'end' },
    ),
  );

  const controls: Partial<Record<StepKey, { child: string; open: boolean }>> = {};

  if (has('developer')) {
    // No recommendation and none on its way: the developer names the version; the service checks it.
    const byHand = !recommended && !diagnosing;
    controls.propose = {
      open: proposable,
      child: column('propose-controls', [
        // Always there, and empty unless the developer has to name the version.
        column(
          'propose-by-hand',
          byHand ? [add({ id: 'propose-version', component: 'TextField', label: 'Version to roll back to', value: { path: '/propose/version' } })] : [],
        ),
        button(
          'propose',
          recommended ? `Propose rollback to ${recommended}` : 'Propose rollback',
          event(ACTIONS.propose, { ...ctx, target_version: byHand ? { path: '/propose/version' } : (recommended ?? '') }),
          {
            variant: 'primary',
            checks: [
              enabledWhen('/can/propose', diagnosing ? 'Waiting for the diagnosis' : 'Nothing to propose right now'),
              ...(byHand ? [filled('/propose/version', 'Enter a version')] : []),
            ],
          },
        ),
        notice('propose'),
      ]),
    };
  }

  if (has('incident-manager')) {
    const proposed = status === 'proposed' ? change : undefined;
    const changeCtx = { ...ctx, change_id: proposed?.id ?? '' };
    controls.approve = {
      open: can.approve,
      child: column('approve-controls', [
        button('approve', proposed ? `Approve rollback to ${proposed.target_version}` : 'Approve rollback', event(ACTIONS.approve, changeCtx), {
          variant: 'primary',
          checks: [enabledWhen('/can/approve', 'There is no proposed change to approve')],
        }),
        row('reject-row', [
          add({ id: 'reject-reason', component: 'TextField', label: 'Reason for rejecting', value: { path: '/reject/reason' }, weight: 1 }),
          button('reject', 'Reject', event(ACTIONS.reject, { ...changeCtx, reason: { path: '/reject/reason' } }), {
            checks: [enabledWhen('/can/approve', 'There is no proposed change to reject'), filled('/reject/reason', 'Give a reason to reject')],
          }),
        ]),
        notice('approve'),
      ]),
    };
  }

  if (has('platform-engineer')) {
    const applicable = can.apply ? change : undefined;
    controls.apply = {
      open: can.apply,
      child: column('apply-controls', [
        button(
          'apply',
          active ? `Apply rollback to ${active.target_version}` : 'Apply rollback',
          event(ACTIONS.apply, { ...ctx, change_id: applicable?.id ?? '' }),
          // Enabled as soon as there is a change to apply, approved or not: the card does not
          // stand in for the service's rule.
          {
            variant: 'primary',
            checks: [
              enabledWhen(
                '/can/apply',
                resolved ? 'The incident is resolved' : inFlight ? 'The rollback is already running' : 'There is no change to apply yet',
              ),
            ],
          },
        ),
        notice('apply'),
      ]),
    };
  }

  // Who owns each step, who did it once it is done, and when.
  const owners: Record<StepKey, { role?: string; by?: string; at?: string }> = {
    propose: { role: 'developer', by: change?.proposed_by, at: change?.at?.proposed },
    approve: {
      role: 'incident-manager',
      by: status === 'rejected' ? change?.rejected_by : change?.approved_by,
      at: status === 'rejected' ? change?.at?.rejected : change?.at?.approved,
    },
    // Applied is the moment the new version was rolled out and verifying began.
    apply: { role: 'platform-engineer', by: change?.applied_by, at: change?.at?.verifying ?? (status === 'failed' ? change?.at?.failed : undefined) },
    verify: { by: 'remediation-agent', at: status === 'failed' ? change?.at?.failed : change?.at?.applied },
    resolve: { at: change?.at?.applied },
  };

  const steps = progressSteps(incident).map(({ key, label, state }) => {
    const owner = owners[key];
    const settled = state === 'done' || state === 'failed';
    const who = (settled && owner.by) || owner.role || owner.by || '';
    const mine = !!owner.role && has(owner.role);
    const control = controls[key];

    let note = '';
    let busy = false;
    if (key === 'propose' && state === 'pending') {
      note = diagnosing ? 'Waiting for the diagnosis' : recommended ? `The diagnosis recommends ${recommended}` : 'No version is recommended';
      busy = diagnosing;
    } else if (key === 'approve' && status === 'proposed') note = mine ? 'Waiting for you' : 'Waiting for approval';
    else if (key === 'approve' && status === 'rejected') note = change?.reject_reason || 'No reason given';
    else if (key === 'apply' && status === 'proposed') note = 'Not approved yet';
    else if (key === 'apply' && status === 'approved') note = mine ? 'Ready for you to apply' : 'Ready to apply';
    else if (key === 'apply' && state === 'current') note = `Rolling out ${change!.target_version}`;
    else if (key === 'verify' && state === 'current') note = 'Checking that the rollback worked';

    return add({
      id: `step-${key}`,
      component: 'Step',
      label,
      state,
      closes: key === 'resolve',
      owner: who,
      ...(owner.role ? { ownerRole: owner.role } : {}),
      // Once a step is done, "you" is the person who did it; until then, anyone with the role.
      you: settled && owner.by ? owner.by === viewer.user : mine,
      note,
      busy,
      time: settled ? clock(owner.at) : '',
      ...(control ? { child: control.child, open: control.open, turn: control.open && can[key as keyof Can] } : {}),
    });
  });
  body.push(add({ id: 'steps', component: 'Steps', children: steps }));

  if (!roles.length) {
    body.push(text('no-actions', 'No actions are available for your role.', 'caption'));
  }

  // --- The status update: the incident-manager's, and apart from the change ---
  if (has('incident-manager')) {
    body.push(text('update-heading', 'Status update', 'h5'));
    body.push(
      add({
        id: 'draft-text',
        component: 'TextField',
        label: 'Write a status update, or have comms-agent draft one',
        accessibility: { label: 'Status update' },
        value: { path: '/draft/text' },
        variant: 'longText',
      }),
    );
    body.push(
      row('update-actions', [
        button('draft', 'Draft status update', event(ACTIONS.draft, ctx)),
        button('post', 'Post status update', event(ACTIONS.post, { ...ctx, text: { path: '/draft/text' } }), {
          checks: [filled('/draft/text', 'Draft a status update first')],
        }),
      ]),
    );
    body.push(notice('update'));
  }

  // --- The cause and its evidence: below the steps, so that however long they are the controls do not move ---
  body.push(text('cause-heading', 'Suspected cause', 'h5'));
  body.push(
    text(
      'cause',
      incident.suspected_cause ??
        (diagnosis?.state === 'running'
          ? `Diagnosing… The diagnosis agent started at ${clock(diagnosis.since, true)} UTC. A diagnosis usually takes 10 to 20 seconds.`
          : diagnosis?.state === 'failed'
            ? `Diagnosis failed: ${diagnosis.message}. No version is recommended.`
            : 'No diagnosis recorded yet.'),
    ),
  );
  // The heading and the list are always part of the card, empty until there is evidence. The body's
  // own list of children then never changes, so the renderer leaves the viewer's buttons alone when
  // the diagnosis arrives: only this list fills in.
  body.push(text('evidence-heading', incident.evidence.length ? 'Evidence' : '', 'caption'));
  body.push(
    column(
      'evidence',
      incident.evidence.map((e, i) =>
        e.url
          ? button(`evidence-${i}`, e.label, { functionCall: { call: 'openUrl', args: { url: e.url }, returnType: 'void' } }, { variant: 'borderless' })
          : text(`evidence-${i}`, e.label),
      ),
    ),
  );

  // --- The timeline comes last: the newest entries, a row each. The rows keep their ids, so a new
  // entry fills one in or adds one, and never takes one away. ---
  body.push(row('timeline-head', [text('timeline-heading', 'Timeline', 'h5'), text('timeline-zone', 'UTC', 'caption')], { justify: 'spaceBetween', align: 'end' }));
  const entries = incident.timeline.length ? incident.timeline.slice(-TIMELINE_ENTRIES) : [{ text: 'Nothing recorded yet.' }];
  body.push(
    column(
      'timeline',
      entries.map((entry, i) =>
        row(`timeline-${i}`, [
          text(`timeline-${i}-at`, clock(entry.at), 'caption'),
          text(`timeline-${i}-text`, entry.text.replace(/\s*\n\s*/g, ' '), 'body', { weight: 1 }),
        ]),
      ),
    ),
  );

  add({ id: 'root', component: 'Column', children: body });

  const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
  const layout = components.map((c) => `${c.id}:${c.component}`).sort();
  const version = hash({ components, can });
  return {
    surfaceId: surfaceIdFor(incident.id),
    incidentId: incident.id,
    version,
    layout,
    components,
    model: {
      meta: { version, layout, incidentId: incident.id },
      can,
      reject: { reason: '' },
      draft: { text: '' },
      propose: { version: '' },
      notice: NO_NOTICE,
    },
  };
}
