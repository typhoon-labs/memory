import { describe, expect, test } from 'vitest';
import { buildIncidentList } from '../src/card/incident-list.js';
import { currentIncident } from '../src/downstream/index.js';
import { CHANGE_STATUSES, incidentWith } from './support/fixtures.js';

describe('the list of incidents beside the card', () => {
  test('says in a few words where each incident stands, following the steps on the card', () => {
    const notes = Object.fromEntries(CHANGE_STATUSES.map((status) => [status, buildIncidentList([incidentWith(status)])[0]!.note]));
    expect(notes).toEqual({
      none: 'Rollback not proposed yet',
      proposed: 'Rollback to 2.0.0 proposed',
      approved: 'Rollback to 2.0.0 approved',
      rejected: 'Rollback to 2.0.0 rejected',
      applying: 'Rolling back to 2.0.0',
      verifying: 'Verifying the rollback to 2.0.0',
      applied: 'Rolled back to 2.0.0',
      failed: 'Rollback to 2.0.0 failed',
    });
  });

  test('carries what a row shows: the id, the service, the summary, the status, and when it was resolved', () => {
    const [open] = buildIncidentList([incidentWith('proposed')]);
    expect(open).toEqual({
      id: 'INC-1',
      service: 'search-service',
      summary: 'Search requests are failing',
      status: 'open',
      resolved: '',
      note: 'Rollback to 2.0.0 proposed',
    });
    const [resolved] = buildIncidentList([incidentWith('applied', { resolved_at: '2026-10-06T10:28:41.000Z' })]);
    expect(resolved).toMatchObject({ status: 'resolved', resolved: '10:28', note: 'Rolled back to 2.0.0' });
  });

  test('without the time it was resolved, the moment its change was verified stands in; without either, nothing is claimed', () => {
    const verified = incidentWith('applied');
    verified.change!.at = { applied: '2026-10-06T09:40:05Z' };
    expect(buildIncidentList([verified])[0]!.resolved).toBe('09:40');
    expect(buildIncidentList([incidentWith('applied')])[0]!.resolved).toBe('');
  });

  test('is newest first, whatever order the service lists them in', () => {
    const older = incidentWith('applied', { id: 'INC-1', opened_at: '2026-10-06T09:14:00Z' });
    const newer = incidentWith('none', { id: 'INC-2', opened_at: '2026-10-06T10:41:00Z' });
    expect(buildIncidentList([older, newer]).map((i) => i.id)).toEqual(['INC-2', 'INC-1']);
    expect(buildIncidentList([newer, older]).map((i) => i.id)).toEqual(['INC-2', 'INC-1']);
  });
});

describe('the incident shown when the viewer has picked none', () => {
  const at = (id: string, status: Parameters<typeof incidentWith>[0], opened_at: string) => incidentWith(status, { id, opened_at });

  test('is the newest that is not resolved, even when a resolved one is newer', () => {
    const incidents = [at('INC-3', 'applied', '2026-10-06T11:00:00Z'), at('INC-2', 'proposed', '2026-10-06T10:00:00Z'), at('INC-1', 'none', '2026-10-06T09:00:00Z')];
    expect(currentIncident(incidents)?.id).toBe('INC-2');
  });

  test('is the most recent when every one is resolved, and none when there are none', () => {
    const incidents = [at('INC-1', 'applied', '2026-10-06T09:00:00Z'), at('INC-2', 'applied', '2026-10-06T10:00:00Z')];
    expect(currentIncident(incidents)?.id).toBe('INC-2');
    expect(currentIncident([])).toBeUndefined();
  });
});
