/**
 * The incident card, built by code from `get_incident` with components of the
 * A2UI basic catalog (v0.9.1). No model is involved.
 *
 * Everyone sees the same body. The action row depends on the viewer's roles.
 * Which buttons are shown or enabled is presentation only: whether an action
 * is allowed is decided by the gateway and by delivery-mcp when it is sent.
 *
 * Layout rule: as an incident moves on, components are added but never taken
 * away. A2UI's `updateComponents` adds or updates components and cannot remove
 * one, so a control that does not apply is disabled (a `checks` rule bound to
 * the data model under `/can`) rather than left out. Every step of an incident,
 * including the diagnosis arriving, is then an update in place: nothing is left
 * behind, and a button a viewer is about to press is not replaced under them.
 */
import { createHash } from 'node:crypto';
import type { DiagnosisStatus } from '../diagnosis-status.js';
import type { Change, Incident } from '../downstream/types.js';

export interface Viewer {
  user: string;
  roles: string[];
  team?: string;
}

/** One basic-catalog component: `id`, `component`, then that component's properties. */
export type Component = { id: string; component: string } & Record<string, unknown>;

/** Which of the viewer's buttons are enabled. Bound from the buttons' `checks`. */
export interface Can {
  propose: boolean;
  approve: boolean;
  apply: boolean;
  restart: boolean;
}

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
  /** Initial data model. `reject`, `draft`, `propose` and `notice` belong to the viewer afterwards. */
  model: {
    meta: { version: string; layout: string[]; incidentId: string };
    can: Can;
    reject: { reason: string };
    draft: { text: string };
    propose: { version: string };
    notice: { text: string };
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

const KNOWN_ROLES = ['developer', 'incident-manager', 'platform-engineer'];
const IN_FLIGHT = ['applying', 'verifying'];
const ACTIVE = ['proposed', 'approved', ...IN_FLIGHT];
const TIMELINE_ENTRIES = 6;

export function surfaceIdFor(incidentId: string): string {
  return `incident-${incidentId.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

/** The five milestones of a change, each marked done, in progress, failed or pending. */
export function progressSteps(incident: Incident): { label: string; state: 'done' | 'current' | 'failed' | 'pending' }[] {
  const status = incident.change?.status;
  const order = ['proposed', 'approved', 'applying', 'verifying', 'applied'];
  const reached = status ? order.indexOf(status) : -1;
  const resolved = incident.status === 'resolved' || status === 'applied';
  const labels = ['Proposed', 'Approved', 'Applying', 'Verifying', 'Resolved'];
  if (status === 'rejected') {
    return [
      { label: 'Proposed', state: 'done' },
      { label: 'Rejected', state: 'failed' },
      ...labels.slice(2).map((label) => ({ label, state: 'pending' as const })),
    ];
  }
  if (status === 'failed') {
    return [
      { label: 'Proposed', state: 'done' },
      { label: 'Approved', state: 'done' },
      { label: 'Apply failed', state: 'failed' },
      ...labels.slice(3).map((label) => ({ label, state: 'pending' as const })),
    ];
  }
  return labels.map((label, i) => {
    if (resolved) return { label, state: 'done' as const };
    if (i < reached) return { label, state: 'done' as const };
    if (i === reached) return { label, state: IN_FLIGHT.includes(order[i]!) ? ('current' as const) : ('done' as const) };
    return { label, state: 'pending' as const };
  });
}

const MARK = { done: '✓', current: '●', failed: '✕', pending: '○' } as const;

function clock(at: string | undefined, seconds = false): string {
  if (!at) return '';
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? '' : `${d.toISOString().slice(11, seconds ? 19 : 16)} `;
}

function changeLine(service: string, change: Change | undefined, recommended: string | undefined, diagnosing: boolean): string {
  if (!change) {
    return recommended
      ? `No change proposed yet. Recommended: roll back ${service} to ${recommended}.`
      : diagnosing
        ? 'No change proposed yet. Waiting for the diagnosis to recommend a version.'
        : 'No change proposed yet.';
  }
  const people = [
    change.proposed_by && `proposed by ${change.proposed_by}`,
    change.approved_by && `approved by ${change.approved_by}`,
    change.rejected_by && `rejected by ${change.rejected_by}`,
    change.applied_by && `applied by ${change.applied_by}`,
  ].filter(Boolean);
  const reason = change.status === 'rejected' && change.reject_reason ? ` Reason: ${change.reject_reason}` : '';
  return `Roll back ${service} to ${change.target_version} (${change.id}): ${people.join(', ') || 'no one recorded'}.${reason}`;
}

/**
 * @param diagnosis where the alert hook's diagnosis stands, while the incident record has none
 */
export function buildIncidentCard(incident: Incident, viewer: Viewer, diagnosis?: DiagnosisStatus): CardSurface {
  const components: Component[] = [];
  const add = (c: Component) => {
    components.push(c);
    return c.id;
  };
  const text = (id: string, value: unknown, variant = 'body') => add({ id, component: 'Text', text: value, variant });
  const column = (id: string, children: string[], extra: Record<string, unknown> = {}) =>
    add({ id, component: 'Column', children, ...extra });
  const row = (id: string, children: string[], extra: Record<string, unknown> = {}) =>
    add({ id, component: 'Row', children, ...extra });
  const divider = (id: string) => add({ id, component: 'Divider' });
  const button = (id: string, label: string, action: unknown, extra: Record<string, unknown> = {}) =>
    add({ id, component: 'Button', child: text(`${id}-label`, label), action, ...extra });
  const event = (name: string, context: Record<string, unknown>) => ({ event: { name, context } });
  const enabledWhen = (path: string, message: string) => ({ condition: { path }, message });
  const filled = (path: string, message: string) => ({
    condition: { call: 'required', args: { value: { path } }, returnType: 'boolean' },
    message,
  });
  const fact = (id: string, label: string, value: string) =>
    // An en dash for a value that is not known: the renderer reads text as Markdown, where a
    // lone hyphen is an empty list item (delivery-mcp reports no running version before a change).
    column(id, [text(`${id}-label`, label, 'caption'), text(`${id}-value`, value || '–')]);

  const change = incident.change;
  const status = change?.status;
  const resolved = incident.status === 'resolved';
  const active = change && ACTIVE.includes(change.status) ? change : undefined;
  const inFlight = !!status && IN_FLIGHT.includes(status);
  const body: string[] = [];
  /** The cause and its evidence: below the viewer's actions, so that however long the evidence is, the buttons stay near the top and do not move when it arrives. */
  const details: string[] = [];

  // --- Body: the same for every viewer ---
  body.push(text('title', incident.summary || `${incident.service} incident`, 'h3'));
  body.push(
    row(
      'facts',
      [
        fact('fact-incident', 'Incident', incident.id),
        fact('fact-service', 'Service', incident.service),
        fact('fact-severity', 'Severity', incident.severity),
        fact('fact-status', 'Status', incident.status),
        fact('fact-version', 'Running version', incident.current_version ?? ''),
      ],
      { justify: 'spaceBetween' },
    ),
  );

  body.push(text('impact-heading', 'Impact', 'h5'));
  if (typeof incident.impact === 'string') {
    body.push(text('impact', incident.impact || 'Not recorded.'));
  } else {
    body.push(
      row(
        'impact',
        Object.entries(incident.impact).map(([label, value], i) =>
          column(`impact-${i}`, [text(`impact-${i}-value`, String(value), 'h4'), text(`impact-${i}-label`, label, 'caption')]),
        ),
        { justify: 'start' },
      ),
    );
  }

  const diagnosing = !incident.suspected_cause && diagnosis?.state === 'running';

  body.push(divider('divider-change'));
  body.push(text('change-heading', 'Proposed change', 'h5'));
  body.push(text('change', changeLine(incident.service, change, incident.recommended_version, diagnosing)));
  body.push(text('change-status', change ? `Change status: ${status}` : 'Change status: none'));
  body.push(
    row(
      'progress',
      progressSteps(incident).map((step, i) => text(`progress-${i}`, `${MARK[step.state]} ${step.label}`)),
      { justify: 'spaceBetween' },
    ),
  );

  // --- Action row: by role ---
  body.push(divider('divider-actions'));
  body.push(text('notice', { path: '/notice/text' }));

  const roles = viewer.roles.filter((r) => KNOWN_ROLES.includes(r));
  const ctx = { incident_id: incident.id };
  const can: Can = {
    // With no recommendation and no diagnosis running, the developer may name the version themselves.
    propose: !resolved && !active && status !== 'applied' && (!!incident.recommended_version || !diagnosing),
    approve: status === 'proposed',
    apply: status === 'approved',
    restart: !resolved,
  };

  if (roles.includes('developer')) {
    const recommended = incident.recommended_version;
    // No recommendation and none on its way: the developer names the version; the service checks it.
    const byHand = !recommended && !diagnosing;
    body.push(text('developer-heading', 'Actions for developer', 'h5'));
    body.push(
      text(
        'developer-note',
        resolved
          ? 'The incident is resolved. Nothing to do.'
          : active
            ? `The rollback to ${active.target_version} is ${active.status}. Nothing to do until it finishes or is rejected.`
            : recommended
              ? `The diagnosis recommends rolling ${incident.service} back to ${recommended}.`
              : diagnosing
                ? 'The diagnosis is running. Propose is enabled once it recommends a version.'
                : 'No version is recommended. Enter the retained version to roll back to; the delivery service checks it.',
      ),
    );
    // Always there, and empty unless the developer has to name the version: see the evidence list above.
    body.push(
      column(
        'propose-by-hand',
        byHand
          ? [add({ id: 'propose-version', component: 'TextField', label: 'Version to roll back to', value: { path: '/propose/version' } })]
          : [],
      ),
    );
    body.push(
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
    );
  }

  if (roles.includes('incident-manager')) {
    const proposed = status === 'proposed' ? change : undefined;
    const changeCtx = { ...ctx, change_id: proposed?.id ?? '' };
    body.push(text('manager-heading', 'Actions for incident-manager', 'h5'));
    body.push(
      text(
        'manager-note',
        proposed
          ? `${proposed.proposed_by ?? 'Someone'} proposed rolling back to ${proposed.target_version}. Approve or reject it.`
          : status
            ? `Nothing to approve: the change is ${status}.`
            : 'Nothing to approve yet.',
      ),
    );
    body.push(
      button('approve', proposed ? `Approve rollback to ${proposed.target_version}` : 'Approve rollback', event(ACTIONS.approve, changeCtx), {
        variant: 'primary',
        checks: [enabledWhen('/can/approve', 'There is no proposed change to approve')],
      }),
    );
    body.push(
      row(
        'reject-row',
        [
          add({ id: 'reject-reason', component: 'TextField', label: 'Reason for rejecting', value: { path: '/reject/reason' }, weight: 1 }),
          button('reject', 'Reject', event(ACTIONS.reject, { ...changeCtx, reason: { path: '/reject/reason' } }), {
            checks: [
              enabledWhen('/can/approve', 'There is no proposed change to reject'),
              filled('/reject/reason', 'Give a reason to reject'),
            ],
          }),
        ],
        { align: 'end' },
      ),
    );
    body.push(button('draft', 'Draft status update', event(ACTIONS.draft, ctx)));
    body.push(
      add({ id: 'draft-text', component: 'TextField', label: 'Status update draft', value: { path: '/draft/text' }, variant: 'longText' }),
    );
    body.push(
      button('post', 'Post status update', event(ACTIONS.post, { ...ctx, text: { path: '/draft/text' } }), {
        checks: [filled('/draft/text', 'Draft a status update first')],
      }),
    );
  }

  if (roles.includes('platform-engineer')) {
    const approved = status === 'approved' ? change : undefined;
    body.push(text('engineer-heading', 'Actions for platform-engineer', 'h5'));
    body.push(
      text(
        'engineer-note',
        resolved
          ? 'The incident is resolved. Nothing to do.'
          : inFlight
            ? `The rollback is ${status}.`
            : approved
              ? `The rollback to ${approved.target_version} is approved and ready to apply.`
              : 'Apply is enabled once an incident-manager approves the change.',
      ),
    );
    body.push(
      row(
        'engineer-row',
        [
          button(
            'apply',
            active ? `Apply rollback to ${active.target_version}` : 'Apply rollback',
            event(ACTIONS.apply, { ...ctx, change_id: approved?.id ?? '' }),
            // Enabled only once the change is approved.
            {
              variant: 'primary',
              checks: [
                enabledWhen(
                  '/can/apply',
                  resolved
                    ? 'The incident is resolved'
                    : inFlight
                      ? 'The rollback is already running'
                      : 'Waiting for an incident-manager to approve',
                ),
              ],
            },
          ),
          button('restart', `Restart ${incident.service}`, event(ACTIONS.restart, { ...ctx, service: incident.service }), {
            checks: [enabledWhen('/can/restart', 'The incident is resolved')],
          }),
        ],
        { align: 'center' },
      ),
    );
  }

  if (!roles.length) {
    body.push(text('no-actions', 'No actions are available for your role.', 'caption'));
  }

  details.push(divider('divider-cause'));
  details.push(text('cause-heading', 'Suspected cause', 'h5'));
  details.push(
    text(
      'cause',
      incident.suspected_cause ??
        (diagnosis?.state === 'running'
          ? `Diagnosing… The diagnosis agent started at ${clock(diagnosis.since, true)}UTC. A diagnosis usually takes 10 to 20 seconds.`
          : diagnosis?.state === 'failed'
            ? `Diagnosis failed: ${diagnosis.message}. No version is recommended.`
            : 'No diagnosis recorded yet.'),
    ),
  );
  // The heading and the list are always part of the card, empty until there is evidence. The body's
  // own list of children then never changes, so the renderer leaves the viewer's buttons alone when
  // the diagnosis arrives: only this list fills in.
  details.push(text('evidence-heading', incident.evidence.length ? 'Evidence' : '', 'caption'));
  details.push(
    column(
      'evidence',
      incident.evidence.map((e, i) =>
        e.url
          ? button(`evidence-${i}`, e.label, { functionCall: { call: 'openUrl', args: { url: e.url }, returnType: 'void' } }, { variant: 'borderless' })
          : text(`evidence-${i}`, e.label),
      ),
    ),
  );
  body.push(...details);

  // The timeline comes last.
  body.push(divider('divider-timeline'));
  body.push(text('timeline-heading', 'Timeline (UTC)', 'h5'));
  // One Text holding a short list, so a new entry never adds or removes a component.
  body.push(
    text(
      'timeline',
      incident.timeline
        .slice(-TIMELINE_ENTRIES)
        .map((entry) => `- ${clock(entry.at)}${entry.text.replace(/\s*\n\s*/g, ' ')}`)
        .join('\n') || 'Nothing recorded yet.',
    ),
  );

  add({ id: 'root', component: 'Card', child: column('body', body) });

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
      notice: { text: '' },
    },
  };
}
