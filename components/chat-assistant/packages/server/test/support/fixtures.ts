import type { Viewer } from '../../src/card/incident-card.js';
import type { ChangeStatus, Incident } from '../../src/downstream/types.js';

export const VIEWERS: Record<string, Viewer> = {
  developer: { user: 'developer', roles: ['developer'], team: 'search' },
  'incident-manager': { user: 'incident-manager', roles: ['incident-manager'], team: 'incident' },
  'platform-engineer': { user: 'platform-engineer', roles: ['platform-engineer'], team: 'platform' },
};

export const CHANGE_STATUSES: (ChangeStatus | 'none')[] = [
  'none',
  'proposed',
  'approved',
  'rejected',
  'applying',
  'verifying',
  'applied',
  'failed',
];

export function incidentWith(status: ChangeStatus | 'none', overrides: Partial<Incident> = {}): Incident {
  const incident: Incident = {
    id: 'INC-1',
    service: 'search-service',
    severity: 'critical',
    summary: 'Search requests are failing',
    impact: { 'Search error rate': '100%', 'Failed searches (5 min)': 412 },
    status: status === 'applied' ? 'resolved' : status === 'applying' || status === 'verifying' ? 'mitigating' : 'open',
    current_version: status === 'applied' ? '2.0.0' : '2.1.0',
    suspected_cause: 'search-service 2.1.0 fails every request.',
    evidence: [{ label: 'Error rate by version', url: 'http://localhost:18084/d/search-errors' }, { label: 'Rollout at 09:02' }],
    recommended_version: '2.0.0',
    timeline: [{ at: '2026-10-06T09:14:00Z', text: 'Incident opened by alert-automation' }],
    ...overrides,
  };
  if (status !== 'none') {
    incident.change = {
      id: 'CHG-1',
      target_version: '2.0.0',
      status,
      proposed_by: 'developer',
      approved_by: ['approved', 'applying', 'verifying', 'applied', 'failed'].includes(status) ? 'incident-manager' : undefined,
      rejected_by: status === 'rejected' ? 'incident-manager' : undefined,
      reject_reason: status === 'rejected' ? 'Try a restart first' : undefined,
      applied_by: ['applying', 'verifying', 'applied', 'failed'].includes(status) ? 'platform-engineer' : undefined,
    };
  }
  return incident;
}
