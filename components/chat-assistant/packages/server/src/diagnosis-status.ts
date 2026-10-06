/**
 * Where a diagnosis stands while the incident record has none yet.
 *
 * delivery-mcp records a diagnosis once it exists; it has no field for "being
 * worked out" or "could not be worked out". The alert hook knows both, so it
 * notes them here and the card shows them. This is memory in one process: after
 * a restart the card says only that no diagnosis is recorded, and the next
 * alert for the incident starts the diagnosis again.
 */
export type DiagnosisStatus =
  | { state: 'running'; since: string }
  | { state: 'failed'; at: string; message: string };

export class DiagnosisTracker {
  private readonly byIncident = new Map<string, DiagnosisStatus>();

  get(incidentId: string): DiagnosisStatus | undefined {
    return this.byIncident.get(incidentId);
  }

  running(incidentId: string): void {
    this.byIncident.set(incidentId, { state: 'running', since: new Date().toISOString() });
  }

  failed(incidentId: string, message: string): void {
    this.byIncident.set(incidentId, { state: 'failed', at: new Date().toISOString(), message });
  }

  /** The diagnosis is in the incident record now; nothing more to say here. */
  recorded(incidentId: string): void {
    this.byIncident.delete(incidentId);
  }
}
