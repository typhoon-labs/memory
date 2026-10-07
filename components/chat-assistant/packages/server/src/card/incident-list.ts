/**
 * The list of incidents beside the card: every incident `delivery-mcp` holds,
 * newest first, each in a few words. It is built by code from `list_incidents`,
 * as the card is from `get_incident`, and is the same for every viewer.
 *
 * It travels in the sync reply as plain data, not as A2UI: the list is how a
 * viewer chooses which incident the card shows, so it is part of the page and
 * the page draws it.
 */
import { newestFirst } from '../downstream/index.js';
import type { Incident } from '../downstream/types.js';
import { clock } from './incident-card.js';

export interface IncidentListEntry {
  id: string;
  service: string;
  summary: string;
  /** `open`, `mitigating` or `resolved`, as the service says it. */
  status: string;
  /** When it was resolved, as `HH:MM` in UTC. Empty while it is not, or when the record does not say. */
  resolved: string;
  /** Where its change stands, in a few words. */
  note: string;
}

/** Where an incident's change stands. The words follow the steps on the card. */
function changeNote(incident: Incident): string {
  const change = incident.change;
  if (!change) return incident.status === 'resolved' ? 'Resolved' : 'Rollback not proposed yet';
  const target = change.target_version;
  const to = target ? ` to ${target}` : '';
  switch (change.status) {
    case 'proposed':
      return `Rollback${to} proposed`;
    case 'approved':
      return `Rollback${to} approved`;
    case 'rejected':
      return `Rollback${to} rejected`;
    case 'applying':
      return `Rolling back${to}`;
    case 'verifying':
      return `Verifying the rollback${to}`;
    case 'applied':
      return `Rolled back${to}`;
    case 'failed':
      return `Rollback${to} failed`;
    default:
      return `Rollback${to} ${change.status}`;
  }
}

export function buildIncidentList(incidents: Incident[]): IncidentListEntry[] {
  return newestFirst(incidents).map((incident) => ({
    id: incident.id,
    service: incident.service,
    summary: incident.summary || `${incident.service} incident`,
    status: incident.status,
    // The service's own time, or the moment the change that resolved it was verified.
    resolved: incident.status === 'resolved' ? clock(incident.resolved_at ?? incident.change?.at?.applied) : '',
    note: changeNote(incident),
  }));
}
