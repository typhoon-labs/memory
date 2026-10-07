import type { Config } from '../config.js';
import { createCommsAgent, createDiagnosisAgent, createRemediationAgent } from './a2a-agents.js';
import { createDeliveryMcp } from './delivery-mcp.js';
import { normalizeIncident, normalizeIncidentList } from './normalize.js';
import { createStubDownstreams } from './stub.js';
import type { Downstreams, Incident } from './types.js';

/**
 * `DELIVERY_MCP_URL` may be the component's base URL (the MCP endpoint is then
 * `/mcp`, as the contracts say) or a gateway route that already has a path,
 * which is used as given.
 */
export function mcpEndpoint(url: string): string {
  const u = new URL(url);
  if (u.pathname === '/' || u.pathname === '') u.pathname = '/mcp';
  return u.toString();
}

export function createDownstreams(config: Config): Downstreams {
  if (config.stubDownstreams) {
    return createStubDownstreams({ seed: config.stub.seed, phaseMs: config.stub.phaseMs, diagnosisMs: config.stub.diagnosisMs });
  }
  return {
    delivery: createDeliveryMcp(mcpEndpoint(config.downstream.deliveryMcpUrl), config.appVersion),
    remediation: createRemediationAgent(config.downstream.remediationAgentUrl),
    comms: createCommsAgent(config.downstream.commsAgentUrl),
    // The one place that picks diagnosis-agent's transport (JSON-RPC today).
    diagnosis: createDiagnosisAgent(config.downstream.diagnosisAgentUrl, config.diagnosisTimeoutMs),
  };
}

export async function getIncident(d: Downstreams, token: string, incidentId: string): Promise<Incident> {
  return normalizeIncident(await d.delivery.callTool(token, 'get_incident', { incident_id: incidentId }));
}

export async function listIncidents(d: Downstreams, token: string): Promise<Incident[]> {
  return normalizeIncidentList(await d.delivery.callTool(token, 'list_incidents', {}));
}

/** Newest first. No assumption about the order the service lists them in: the newest is the one opened last. */
export function newestFirst(incidents: Incident[]): Incident[] {
  return incidents
    .map((incident, index) => ({ incident, index }))
    .sort((a, b) => (b.incident.opened_at ?? '').localeCompare(a.incident.opened_at ?? '') || a.index - b.index)
    .map(({ incident }) => incident);
}

/**
 * The incident a viewer sees when they have picked none: the newest that is
 * not resolved, or, when every one is resolved, the most recent.
 */
export function currentIncident(incidents: Incident[]): Incident | undefined {
  const ordered = newestFirst(incidents);
  return ordered.find((i) => i.status !== 'resolved') ?? ordered[0];
}

/**
 * What one viewer's page needs: every incident, for the list beside the card,
 * and the one the card shows. That is the incident the viewer picked, if it
 * still exists, and otherwise the current one. It is read with `get_incident`.
 */
export async function incidentsFor(d: Downstreams, token: string, picked?: string): Promise<{ all: Incident[]; shown?: Incident }> {
  const all = newestFirst(await listIncidents(d, token));
  const choice = (picked ? all.find((i) => i.id === picked) : undefined) ?? currentIncident(all);
  return { all, shown: choice ? await getIncident(d, token, choice.id) : undefined };
}
