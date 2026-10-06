/**
 * What the chat assistant needs from the other components, as interfaces.
 * Every method takes the caller's bearer token and acts as that caller.
 * Two implementations exist: the real ones (MCP and A2A through the gateway)
 * and in-memory fakes (`STUB_DOWNSTREAMS=1`).
 */

export type ChangeStatus = 'proposed' | 'approved' | 'rejected' | 'applying' | 'verifying' | 'applied' | 'failed';
export type IncidentStatus = 'open' | 'mitigating' | 'resolved';

export interface Change {
  id: string;
  target_version: string;
  status: ChangeStatus | string;
  proposed_by?: string;
  approved_by?: string;
  rejected_by?: string;
  reject_reason?: string;
  applied_by?: string;
  operation_id?: string;
}

export interface Evidence {
  label: string;
  url?: string;
}

export interface TimelineEntry {
  at?: string;
  text: string;
}

export interface Incident {
  id: string;
  service: string;
  severity: string;
  summary: string;
  /** Free text or a small object of named numbers; rendered as given. */
  impact: string | Record<string, string | number>;
  status: IncidentStatus | string;
  /** The version the service runs now, when the incident record lets us tell. */
  current_version?: string;
  opened_at?: string;
  suspected_cause?: string;
  evidence: Evidence[];
  recommended_version?: string;
  /** The most recent change for this incident, if any. */
  change?: Change;
  timeline: TimelineEntry[];
}

/** The tools of delivery-mcp, by the names in the conventions. */
export interface Delivery {
  callTool(token: string, name: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface AgentReply {
  text: string;
  /** Structured payloads the agent returned, if any. */
  data: unknown[];
  /** The A2A task ended in a state other than completed. */
  failed?: boolean;
}

export interface RemediationAgent {
  /** `{"action": "apply_and_verify", "change_id": ...}`; resolves when the agent reports the verified result. */
  applyAndVerify(token: string, changeId: string): Promise<AgentReply>;
}

export interface CommsAgent {
  /** `{"action": "draft_status_update", "incident_id": ...}`; returns a draft and posts nothing. */
  draftStatusUpdate(token: string, incidentId: string): Promise<AgentReply>;
}

export interface Diagnosis {
  suspected_cause: string;
  evidence: Evidence[];
  recommended_version?: string;
  /** The agent's reply as text, for chat answers. */
  text: string;
}

/**
 * diagnosis-agent, behind a small interface: callers do not depend on its
 * transport (A2A 1.0 over JSON-RPC today; it also offers gRPC). The transport
 * is chosen in `createDownstreams`.
 */
export interface DiagnosisAgent {
  /** False when no URL is configured: a diagnosis cannot even be attempted. */
  readonly configured: boolean;
  diagnose(token: string, question: string): Promise<Diagnosis>;
}

export interface Downstreams {
  delivery: Delivery;
  remediation: RemediationAgent;
  comms: CommsAgent;
  diagnosis: DiagnosisAgent;
}

export type RefusalLayer = 'gateway' | 'service';

/**
 * A downstream said no. `layer` records who: the gateway (HTTP 401/403, or the
 * tool is not offered to this caller) or the service's own rule.
 */
export class Refusal extends Error {
  readonly layer: RefusalLayer;
  readonly rule?: string;
  readonly status?: number;
  readonly detail: string;

  constructor(input: { layer: RefusalLayer; rule?: string; status?: number; detail: string }) {
    super(refusalText(input));
    this.name = 'Refusal';
    this.layer = input.layer;
    this.rule = input.rule;
    this.status = input.status;
    this.detail = input.detail;
  }

  toJSON() {
    return { layer: this.layer, rule: this.rule, status: this.status, message: this.detail, text: this.message };
  }
}

/** The one sentence shown to the user. */
export function refusalText(r: { layer: RefusalLayer; rule?: string; status?: number; detail: string }): string {
  if (r.layer === 'gateway') {
    const why = r.status ? `HTTP ${r.status}` : 'tool not available to you';
    return `Refused by the gateway (${why}): ${r.detail}`;
  }
  return `Refused by the service: ${r.rule ?? 'rule not named'} - ${r.detail}`;
}

/** A downstream failed for a reason that is not a refusal. */
export class DownstreamError extends Error {
  constructor(
    readonly target: string,
    message: string,
    /** The downstream asked to be tried again. */
    readonly retryable = false,
  ) {
    super(`${target}: ${message}`);
    this.name = 'DownstreamError';
  }
}
