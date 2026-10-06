import type { Config } from '../config.js';
import { createCommsAgent, createDiagnosisAgent, createRemediationAgent } from './a2a-agents.js';
import { createDeliveryMcp } from './delivery-mcp.js';
import { normalizeIncident, normalizeIncidentList } from './normalize.js';
import { createStubDownstreams } from './stub.js';
import type { Downstreams, Incident } from './types.js';

/**
 * `DELIVERY_MCP_URL` may be the component's base URL (the MCP endpoint is then
 * `/mcp`, as the conventions say) or a gateway route that already has a path,
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

/**
 * The incidents the card pane shows: every incident that is not resolved, or,
 * when there is none, the most recent one. Each is read with `get_incident`.
 */
export async function currentIncidents(d: Downstreams, token: string): Promise<Incident[]> {
  const all = await listIncidents(d, token);
  const open = all.filter((i) => i.status !== 'resolved');
  // No assumption about the list's order: the most recent is the one opened last.
  const latest = all.reduce<Incident | undefined>(
    (best, i) => (!best || (i.opened_at ?? '') >= (best.opened_at ?? '') ? i : best),
    undefined,
  );
  const shown = open.length ? open : latest ? [latest] : [];
  return Promise.all(shown.map((i) => getIncident(d, token, i.id)));
}
