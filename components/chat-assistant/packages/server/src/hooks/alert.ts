/**
 * POST /hooks/alert - a Prometheus Alertmanager webhook (payload version 4).
 *
 * The caller is a machine identity (client `alert-automation`, role
 * `alert-automation`). Everything below runs as that identity: its token is
 * forwarded to delivery-mcp and to diagnosis-agent.
 *
 * For each firing alert, in this order:
 *   1. `open_incident`, so the card exists as soon as the alert arrives;
 *   2. answer the webhook (Alertmanager only needs a 2xx, and soon);
 *   3. ask diagnosis-agent, which takes about 15 seconds, while the card says
 *      "Diagnosing";
 *   4. `record_diagnosis`; the card fills in on each viewer's next poll. If the
 *      diagnosis fails or times out the card says so.
 *
 * Alertmanager repeats an alert. There is one open incident per service, so a
 * repeat opens nothing; it starts the diagnosis again only if the incident has
 * none and none is running.
 */
import type { Request, RequestHandler, Response } from 'express';
import type { DiagnosisTracker } from '../diagnosis-status.js';
import { listIncidents } from '../downstream/index.js';
import { normalizeIncident } from '../downstream/normalize.js';
import { Refusal, type Downstreams } from '../downstream/types.js';

export const ALERT_ROLE = 'alert-automation';

interface Alert {
  status?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

interface AlertResult {
  service: string;
  outcome: 'opened' | 'already_open' | 'refused' | 'failed';
  incident_id?: string;
  /** `started`: running now, the card will show the result. `failed`: it could not even start. */
  diagnosis?: 'started' | 'in_progress' | 'skipped' | 'failed';
  message?: string;
}

export interface AlertHook {
  handler: RequestHandler;
  /** Resolves when every diagnosis started so far has ended (for tests). */
  settled(): Promise<void>;
}

function question(service: string, alert: Alert): string {
  const name = alert.labels?.alertname ?? 'unnamed alert';
  const summary = alert.annotations?.summary ?? alert.annotations?.description ?? '';
  return `Alert ${name} is firing for service ${service}.${summary ? ` ${summary}` : ''} Investigate and report the suspected cause, the evidence and the version to roll back to.`;
}

export function alertHook(d: Downstreams, tracker: DiagnosisTracker): AlertHook {
  /** Services whose alert is being handled right now: two identical alerts must not both open an incident. */
  const opening = new Set<string>();
  const background = new Set<Promise<void>>();

  /** Steps 3 and 4. Never throws: the outcome goes to the tracker, and from there to the card. */
  async function diagnose(token: string, incidentId: string, service: string, alert: Alert): Promise<void> {
    try {
      const diagnosis = await d.diagnosis.diagnose(token, question(service, alert));
      if (!diagnosis.recommended_version) throw new Error('the diagnosis recommended no version');
      await d.delivery.callTool(token, 'record_diagnosis', {
        incident_id: incidentId,
        suspected_cause: diagnosis.suspected_cause,
        evidence: diagnosis.evidence.map((e) => (e.url ? `${e.label}: ${e.url}` : e.label)),
        recommended_version: diagnosis.recommended_version,
      });
      tracker.recorded(incidentId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      tracker.failed(incidentId, message);
      console.warn(`[chat-assistant] diagnosis for ${incidentId} (${service}) failed: ${message}`);
    }
  }

  async function handle(token: string, service: string, alert: Alert): Promise<AlertResult> {
    const existing = (await listIncidents(d, token)).find((i) => i.service === service && i.status !== 'resolved');
    if (existing?.suspected_cause) return { service, outcome: 'already_open', incident_id: existing.id, diagnosis: 'skipped' };

    let incidentId = existing?.id;
    if (!incidentId) {
      const opened = await d.delivery.callTool(token, 'open_incident', {
        service,
        severity: alert.labels?.severity ?? 'unknown',
        summary: alert.annotations?.summary ?? alert.labels?.alertname ?? `Alert on ${service}`,
        impact: alert.annotations?.impact ?? alert.annotations?.description ?? 'Not stated by the alert.',
      });
      incidentId = normalizeIncident(opened).id;
    }
    const outcome = existing ? 'already_open' : 'opened';

    if (tracker.get(incidentId)?.state === 'running') return { service, outcome, incident_id: incidentId, diagnosis: 'in_progress' };
    if (!d.diagnosis.configured) {
      const message = 'diagnosis-agent: DIAGNOSIS_AGENT_URL is not set';
      tracker.failed(incidentId, message);
      return { service, outcome, incident_id: incidentId, diagnosis: 'failed', message };
    }

    tracker.running(incidentId);
    const run = diagnose(token, incidentId, service, alert).finally(() => background.delete(run));
    background.add(run);
    return { service, outcome, incident_id: incidentId, diagnosis: 'started' };
  }

  const handler = async (req: Request, res: Response) => {
    const identity = req.identity!;
    if (!identity.roles.includes(ALERT_ROLE)) {
      res.status(403).json({ error: 'forbidden', layer: 'chat-assistant', message: `The alert hook requires the role ${ALERT_ROLE}.` });
      return;
    }
    const alerts: Alert[] = Array.isArray(req.body?.alerts) ? req.body.alerts : [];
    const firing = new Map<string, Alert>();
    for (const alert of alerts) {
      const service = alert.labels?.service ?? alert.labels?.app ?? alert.labels?.job;
      if ((alert.status ?? req.body?.status) === 'firing' && service && !firing.has(service)) firing.set(service, alert);
    }

    const results: AlertResult[] = [];
    for (const [service, alert] of firing) {
      if (opening.has(service)) {
        results.push({ service, outcome: 'already_open', diagnosis: 'in_progress', message: 'the same alert is being handled' });
        continue;
      }
      opening.add(service);
      try {
        results.push(await handle(identity.token, service, alert));
      } catch (err) {
        results.push(
          err instanceof Refusal
            ? { service, outcome: 'refused', message: err.message }
            : { service, outcome: 'failed', message: err instanceof Error ? err.message : String(err) },
        );
      } finally {
        opening.delete(service);
      }
    }

    // Alertmanager retries on 5xx only; a refusal will not get better by retrying.
    const status = results.some((r) => r.outcome === 'failed') ? 502 : results.some((r) => r.outcome === 'refused') ? 403 : 200;
    res.status(status).json({ results });
  };

  return { handler, settled: async () => void (await Promise.all([...background])) };
}
