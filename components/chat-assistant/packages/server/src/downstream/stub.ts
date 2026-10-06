/**
 * In-memory fakes for delivery-mcp, remediation-agent, comms-agent and
 * diagnosis-agent (`STUB_DOWNSTREAMS=1`), so the chat assistant and its UI can
 * be shown on their own.
 *
 * They obey the rules in agent-platform/docs/conventions.md, in two layers,
 * as the real platform does:
 *   - "gateway": which role may call which tool (a refusal looks like HTTP 403);
 *   - "service": the rule the service enforces itself, returned as
 *     {"error": "forbidden", "layer": "service", "rule": ..., "message": ...}.
 *
 * The caller is read from the bearer token, which the server verified before
 * any call reaches here. Result shapes, identifiers (`INC-0001`, `CHG-0001`)
 * and rule names follow the real delivery-mcp (components/delivery-mcp), so
 * what is tested against the stub is what the real service sends.
 */
import { decodeJwt } from 'jose';
import { identityFromClaims, type Identity } from '../auth.js';
import { normalizeDiagnosis } from './normalize.js';
import { Refusal, type AgentReply, type ChangeStatus, type Downstreams, type IncidentStatus } from './types.js';

interface StubChange {
  change_id: string;
  incident_id: string;
  service: string;
  target_version: string;
  previous_version: string;
  status: ChangeStatus;
  operation_id: string;
  proposed_by: string;
  proposed_at: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  reject_reason?: string;
  applied_by?: string;
  applied_at?: string;
  detail?: string;
  history: { status: ChangeStatus; at: string; by: string | null; detail: string | null }[];
  /** Stub only: when the fake rollout began. Not part of the result. */
  applyStartedAt?: number;
}

interface StubIncident {
  incident_id: string;
  service: string;
  severity: string;
  summary: string;
  impact: string;
  status: IncidentStatus;
  opened_by: string;
  opened_at: string;
  resolved_at: string | null;
  diagnosis: {
    suspected_cause: string;
    evidence: string[];
    recommended_version: string;
    recorded_by: string;
    recorded_at: string;
  } | null;
  changes: string[];
  status_updates: { text: string; posted_by: string; posted_at: string }[];
}

/** Role each tool is offered to; '*' is any signed-in caller. */
const TOOL_ROLE: Record<string, string> = {
  list_incidents: '*',
  get_incident: '*',
  open_incident: 'alert-automation',
  record_diagnosis: 'alert-automation',
  propose_change: 'developer',
  approve_change: 'incident-manager',
  reject_change: 'incident-manager',
  apply_change: 'platform-engineer',
  restart_workload: 'platform-engineer',
  post_status_update: 'incident-manager',
};

export interface StubOptions {
  seed: boolean;
  /** How long the fake rollout spends in `applying`, then in `verifying`. */
  phaseMs: number;
  /** How long the fake diagnosis takes (the real one takes 11 to 14 seconds). */
  diagnosisMs?: number;
  now?: () => number;
}

export function createStubDownstreams(options: StubOptions): Downstreams {
  const now = options.now ?? Date.now;
  const services: Record<string, { team: string; current: string; retained: string[] }> = {
    'search-service': { team: 'search', current: '2.1.0', retained: ['2.0.0', '2.1.0'] },
    'registration-service': { team: 'registration', current: '1.4.0', retained: ['1.3.0', '1.4.0'] },
  };
  const incidents = new Map<string, StubIncident>();
  const changes = new Map<string, StubChange>();
  let incidentSeq = 0;
  let changeSeq = 0;

  const iso = () => new Date(now()).toISOString();
  const who = (token: string): Identity => identityFromClaims(decodeJwt(token), token);

  function serviceRefusal(rule: string, message: string): Refusal {
    return new Refusal({ layer: 'service', rule, detail: message });
  }

  function gatewayCheck(caller: Identity, what: string, role: string) {
    if (role !== '*' && !caller.roles.includes(role)) {
      throw new Refusal({
        layer: 'gateway',
        status: 403,
        detail: `${what} is not allowed for role ${caller.roles.join(', ') || '(none)'}`,
      });
    }
  }

  function move(change: StubChange, status: ChangeStatus, by: string | null, detail: string | null = null) {
    change.status = status;
    change.history.push({ status, at: iso(), by, detail });
  }

  /** The fake rollout advances with the clock: applying, then verifying, then applied. */
  function advance(change: StubChange) {
    if (change.applyStartedAt === undefined || change.status === 'applied' || change.status === 'failed') return;
    const elapsed = now() - change.applyStartedAt;
    const incident = incidents.get(change.incident_id)!;
    if (elapsed >= options.phaseMs && change.status === 'applying') {
      move(change, 'verifying', null, 'checking with a real search request');
    }
    if (elapsed >= 2 * options.phaseMs && change.status === 'verifying') {
      move(change, 'applied', null, 'the search request succeeded');
      change.applied_at = iso();
      services[change.service]!.current = change.target_version;
      incident.status = 'resolved';
      incident.resolved_at = iso();
    }
  }

  function view(incident: StubIncident) {
    const { changes: ids, ...rest } = incident;
    return {
      ...rest,
      changes: ids.map((id) => {
        const change = changes.get(id)!;
        advance(change);
        const { applyStartedAt: _stubOnly, ...shown } = change;
        return shown;
      }),
      // advance() may have resolved the incident just now.
      status: incident.status,
      resolved_at: incident.resolved_at,
    };
  }

  function incidentOr404(id: unknown): StubIncident {
    const incident = incidents.get(String(id));
    if (!incident) throw serviceRefusal('incident_exists', `there is no incident ${String(id)}`);
    return incident;
  }

  function changeOr404(id: unknown): StubChange {
    const change = changes.get(String(id));
    if (!change) throw serviceRefusal('change_exists', `there is no change ${String(id)}`);
    advance(change);
    return change;
  }

  const tools: Record<string, (caller: Identity, args: Record<string, unknown>) => unknown> = {
    // Newest first, like the real service.
    list_incidents: () => ({ incidents: [...incidents.values()].reverse().map(view) }),
    get_incident: (_caller, args) => view(incidentOr404(args.incident_id)),

    open_incident(caller, args) {
      const service = String(args.service ?? '');
      if (!services[service]) throw serviceRefusal('service_is_known', `'${service}' is not a known service`);
      const open = [...incidents.values()].find((i) => i.service === service && i.status !== 'resolved');
      if (open) {
        throw serviceRefusal(
          'one_open_incident_per_service',
          `${service} already has an unresolved incident (${open.incident_id}); a service has one at a time.`,
        );
      }
      const incident: StubIncident = {
        incident_id: `INC-${String(++incidentSeq).padStart(4, '0')}`,
        service,
        severity: String(args.severity ?? ''),
        summary: String(args.summary ?? ''),
        impact: String(args.impact ?? ''),
        status: 'open',
        opened_by: caller.user,
        opened_at: iso(),
        resolved_at: null,
        diagnosis: null,
        changes: [],
        status_updates: [],
      };
      incidents.set(incident.incident_id, incident);
      return view(incident);
    },

    record_diagnosis(caller, args) {
      const incident = incidentOr404(args.incident_id);
      const recommended = String(args.recommended_version ?? '').trim();
      if (!recommended) throw serviceRefusal('argument_is_valid', 'recommended_version must be a non-empty string');
      incident.diagnosis = {
        suspected_cause: String(args.suspected_cause ?? ''),
        evidence: Array.isArray(args.evidence) ? args.evidence.map(String) : [],
        recommended_version: recommended,
        recorded_by: caller.user,
        recorded_at: iso(),
      };
      return view(incident);
    },

    propose_change(caller, args) {
      const incident = incidentOr404(args.incident_id);
      const service = services[incident.service]!;
      const target = String(args.target_version ?? '');
      if (caller.team !== service.team) {
        throw serviceRefusal(
          'team_owns_service',
          `${incident.service} is owned by team ${service.team}; you are in team ${caller.team ?? '(none)'}`,
        );
      }
      if (incident.status === 'resolved') throw serviceRefusal('incident_is_open', `incident ${incident.incident_id} is resolved`);
      const index = service.retained.indexOf(target);
      if (index === -1 || index >= service.retained.indexOf(service.current)) {
        throw serviceRefusal(
          'target_is_retained_earlier_version',
          `${target || '(empty)'} is not a retained version earlier than ${service.current}`,
        );
      }
      const active = incident.changes.map((id) => changeOr404(id)).find((c) => !['rejected', 'failed'].includes(c.status));
      if (active) throw serviceRefusal('change_is_pending', `${active.change_id} is already ${active.status}`);
      const change: StubChange = {
        change_id: `CHG-${String(++changeSeq).padStart(4, '0')}`,
        incident_id: incident.incident_id,
        service: incident.service,
        target_version: target,
        previous_version: service.current,
        status: 'proposed',
        operation_id: `op-${crypto.randomUUID().slice(0, 8)}`,
        proposed_by: caller.user,
        proposed_at: iso(),
        history: [{ status: 'proposed', at: iso(), by: caller.user, detail: null }],
      };
      changes.set(change.change_id, change);
      incident.changes.push(change.change_id);
      return { ...change };
    },

    approve_change(caller, args) {
      const change = changeOr404(args.change_id);
      if (change.proposed_by === caller.user) {
        throw serviceRefusal('approver_is_not_proposer', 'the person who proposed a change cannot approve it');
      }
      if (change.status !== 'proposed') {
        throw serviceRefusal('change_is_pending', `${change.change_id} is ${change.status}, not proposed`);
      }
      move(change, 'approved', caller.user);
      change.approved_by = caller.user;
      change.approved_at = iso();
      return { ...change };
    },

    reject_change(caller, args) {
      const change = changeOr404(args.change_id);
      if (change.status !== 'proposed') {
        throw serviceRefusal('change_is_pending', `${change.change_id} is ${change.status}, not proposed`);
      }
      change.reject_reason = String(args.reason ?? '');
      move(change, 'rejected', caller.user, change.reject_reason);
      change.rejected_by = caller.user;
      change.rejected_at = iso();
      return { ...change };
    },

    apply_change(caller, args) {
      const change = changeOr404(args.change_id);
      const incident = incidents.get(change.incident_id)!;
      // Idempotent on change_id: a repeat returns the same operation.
      if (['applying', 'verifying', 'applied'].includes(change.status)) return { ...change, replayed: true };
      if (change.status !== 'approved') {
        throw serviceRefusal('change_is_approved', `${change.change_id} is ${change.status}; it must be approved first`);
      }
      move(change, 'applying', caller.user);
      change.applied_by = caller.user;
      change.applyStartedAt = now();
      incident.status = 'mitigating';
      return { ...change, replayed: false };
    },

    restart_workload(_caller, args) {
      const service = String(args.service ?? '');
      if (!services[service]) throw serviceRefusal('service_is_known', `'${service}' is not a known service`);
      return { service, restarted: true, version: services[service].current };
    },

    post_status_update(caller, args) {
      const incident = incidentOr404(args.incident_id);
      incident.status_updates.push({ text: String(args.text ?? ''), posted_by: caller.user, posted_at: iso() });
      return { incident_id: incident.incident_id, posted: true };
    },
  };

  const delivery: Downstreams['delivery'] = {
    async callTool(token, name, args) {
      const caller = who(token);
      const tool = tools[name];
      if (!tool) throw new Refusal({ layer: 'gateway', detail: `the tool ${name} is not offered to you` });
      gatewayCheck(caller, `the tool ${name}`, TOOL_ROLE[name]!);
      return structuredClone(tool(caller, args));
    },
  };

  if (options.seed) {
    const incident: StubIncident = {
      incident_id: `INC-${String(++incidentSeq).padStart(4, '0')}`,
      service: 'search-service',
      severity: 'critical',
      summary: 'Search requests are failing',
      impact: '100% of searches are failing: 412 failed in the last 5 minutes, about 310 users affected.',
      status: 'open',
      opened_by: 'service-account-alert-automation',
      opened_at: iso(),
      resolved_at: null,
      diagnosis: {
        suspected_cause:
          'search-service 2.1.0 was rolled out 12 minutes before the first error; every search has returned HTTP 500 since.',
        evidence: [
          'Error rate by version (Grafana): http://localhost:18084/d/search-errors',
          'Rollout of 2.1.0 completed at 09:02; 2.0.0 is retained',
        ],
        recommended_version: '2.0.0',
        recorded_by: 'service-account-alert-automation',
        recorded_at: iso(),
      },
      changes: [],
      status_updates: [],
    };
    incidents.set(incident.incident_id, incident);
  }

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  return {
    delivery,

    remediation: {
      async applyAndVerify(token, changeId): Promise<AgentReply> {
        // The agent calls apply_change as the caller, so the same two layers apply.
        await delivery.callTool(token, 'apply_change', { change_id: changeId });
        const change = changes.get(changeId)!;
        const deadline = now() + 4 * options.phaseMs + 2000;
        while (change.status !== 'applied' && now() < deadline) {
          await sleep(Math.min(100, options.phaseMs));
          advance(change);
        }
        const verified = change.status === 'applied';
        return {
          text: verified
            ? `${changeId} applied: ${change.service} is on ${change.target_version} and a real search request succeeded.`
            : `${changeId} is ${change.status}; verification has not completed.`,
          data: [{ change_id: changeId, status: change.status, verified, operation_id: change.operation_id }],
        };
      },
    },

    comms: {
      async draftStatusUpdate(token, incidentId): Promise<AgentReply> {
        gatewayCheck(who(token), 'comms-agent', 'incident-manager');
        const incident = view(incidentOr404(incidentId));
        const change = incident.changes.at(-1);
        const next = !change
          ? 'A fix is being prepared.'
          : change.status === 'applied'
            ? `The rollback to ${change.target_version} is complete and verified.`
            : `A rollback to ${change.target_version} is ${change.status}.`;
        const text =
          `${incident.incident_id}: ${incident.summary} (${incident.service}, ${incident.severity}). ` +
          `Status: ${incident.status}. ${next} Next update in 30 minutes.`;
        return { text, data: [{ incident_id: incidentId, draft: text }] };
      },
    },

    diagnosis: {
      configured: true,
      async diagnose(token, question) {
        who(token);
        if (options.diagnosisMs) await sleep(options.diagnosisMs);
        const service = Object.keys(services).find((s) => question.includes(s)) ?? 'search-service';
        const s = services[service]!;
        const previous = s.retained[s.retained.indexOf(s.current) - 1];
        return normalizeDiagnosis(
          `The errors on ${service} began with the rollout of ${s.current}.`,
          [
            {
                suspected_cause: `${service} ${s.current} fails every request since its rollout; ${previous ?? 'no earlier version'} was healthy.`,
              evidence: [
                { label: 'Error rate by version (Grafana)', url: 'http://localhost:18084/d/search-errors' },
                { label: `Rollout of ${s.current} immediately precedes the first error` },
              ],
              recommended_version: previous,
            },
          ],
        );
      },
    },
  };
}
