/**
 * The conventions fix tool names, arguments and status values, but not the
 * exact JSON a tool returns. These readers accept the reasonable spellings so
 * the card does not break on a field name.
 */
import { Refusal, type Change, type Diagnosis, type Evidence, type Incident, type TimelineEntry } from './types.js';

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : undefined;
}

function str(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return undefined;
}

const URL_RE = /https?:\/\/[^\s)>\]"']+/;

export function isHttpUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeEvidence(raw: unknown): Evidence[] {
  if (!Array.isArray(raw)) return [];
  const out: Evidence[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      const url = item.match(URL_RE)?.[0];
      const label = item.replace(URL_RE, '').replace(/[\s:\-–(\[]+$/, '').trim();
      out.push(url ? { label: label || url, url } : { label: item });
      continue;
    }
    const o = rec(item);
    if (!o) continue;
    const url = str(o.url, o.link, o.href);
    const label = str(o.label, o.title, o.name, o.description, o.text, o.summary) ?? url ?? JSON.stringify(o);
    out.push(isHttpUrl(url) ? { label, url } : { label });
  }
  return out;
}

function normalizeChange(raw: unknown): Change | undefined {
  const o = rec(raw);
  if (!o) return undefined;
  const id = str(o.change_id, o.id);
  if (!id) return undefined;
  return {
    id,
    target_version: str(o.target_version, o.version) ?? '',
    status: str(o.status) ?? 'proposed',
    proposed_by: str(o.proposed_by),
    approved_by: str(o.approved_by),
    rejected_by: str(o.rejected_by),
    reject_reason: str(o.reject_reason, o.rejection_reason, o.reason),
    applied_by: str(o.applied_by),
    operation_id: str(o.operation_id, o.operation_identifier, o.operation),
  };
}

function normalizeTimeline(raw: unknown): TimelineEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: TimelineEntry[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      out.push({ text: item });
      continue;
    }
    const o = rec(item);
    if (!o) continue;
    const text = str(o.text, o.message, o.event, o.description, o.summary);
    if (!text) continue;
    const by = str(o.by, o.actor, o.user);
    out.push({ at: str(o.at, o.time, o.timestamp, o.ts), text: by && !text.includes(by) ? `${text} (${by})` : text });
  }
  return out;
}

/**
 * delivery-mcp returns no ready-made timeline: it records who opened the
 * incident, when the diagnosis was recorded, each change's `history` and the
 * status updates. The card's short timeline is those, in time order.
 */
function timelineFromRecord(o: Rec, d: Rec | undefined, changes: unknown[]): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  if (str(o.opened_at)) out.push({ at: str(o.opened_at), text: `Incident opened${str(o.opened_by) ? ` by ${str(o.opened_by)}` : ''}` });
  if (d && str(d.recorded_at)) {
    const version = str(d.recommended_version);
    out.push({ at: str(d.recorded_at), text: `Diagnosis recorded${version ? `: roll back to ${version}` : ''}` });
  }
  for (const raw of changes) {
    const change = rec(raw);
    if (!change || !Array.isArray(change.history)) continue;
    const target = str(change.target_version) ?? '';
    for (const item of change.history) {
      const h = rec(item);
      const status = str(h?.status);
      if (!h || !status) continue;
      const by = str(h.by);
      const detail = str(h.detail);
      const who = by ? ` by ${by}` : '';
      const text =
        status === 'proposed'
          ? `Rollback to ${target} proposed${who}`
          : status === 'approved'
            ? `Change approved${who}`
            : status === 'rejected'
              ? `Change rejected${who}${detail ?? str(change.reject_reason) ? `: ${detail ?? str(change.reject_reason)}` : ''}`
              : status === 'applying'
                ? `Rollback to ${target} started${who}`
                : status === 'verifying'
                  ? `Rolled out ${target}; verifying${detail ? `: ${detail}` : ''}`
                  : status === 'applied'
                    ? `Rollback to ${target} verified${detail ? `: ${detail}` : ''}`
                    : `Change ${status}${who}${detail ? `: ${detail}` : ''}`;
      out.push({ at: str(h.at), text });
    }
  }
  for (const item of Array.isArray(o.status_updates) ? o.status_updates : []) {
    const u = rec(item);
    const text = str(u?.text);
    if (u && text) out.push({ at: str(u.posted_at, u.at), text: `Status update${str(u.posted_by) ? ` by ${str(u.posted_by)}` : ''}: ${text}` });
  }
  // Stable sort: entries without a time keep their place.
  return out
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => (a.entry.at && b.entry.at ? a.entry.at.localeCompare(b.entry.at) : 0) || a.index - b.index)
    .map(({ entry }) => entry);
}

export function normalizeIncident(raw: unknown): Incident {
  const outer = rec(raw) ?? {};
  const o = rec(outer.incident) ?? outer;
  const d = rec(o.diagnosis) ?? (o.diagnosis === null ? undefined : o);
  const changes = Array.isArray(o.changes) ? o.changes : [];
  const latest = rec(o.change ?? o.proposed_change ?? o.current_change ?? changes.at(-1));
  const explicitTimeline = normalizeTimeline(o.timeline ?? o.events ?? o.history);
  const impact = rec(o.impact)
    ? (Object.fromEntries(
        Object.entries(o.impact as Rec).filter(([, v]) => typeof v === 'string' || typeof v === 'number'),
      ) as Record<string, string | number>)
    : (str(o.impact) ?? '');
  return {
    id: str(o.incident_id, o.id) ?? '',
    service: str(o.service) ?? '',
    severity: str(o.severity) ?? '',
    summary: str(o.summary, o.title) ?? '',
    impact,
    status: str(o.status) ?? 'open',
    // Stated by the service, or read from the latest change: its target once applied, else what it replaces.
    current_version:
      str(o.current_version, o.running_version, o.version) ??
      (latest ? (str(latest.status) === 'applied' ? str(latest.target_version) : str(latest.previous_version)) : undefined),
    opened_at: str(o.opened_at),
    suspected_cause: str(d?.suspected_cause, d?.cause),
    evidence: normalizeEvidence(d?.evidence),
    recommended_version: str(d?.recommended_version),
    change: normalizeChange(latest),
    timeline: explicitTimeline.length ? explicitTimeline : timelineFromRecord(o, rec(o.diagnosis), changes),
  };
}

export function normalizeIncidentList(raw: unknown): Incident[] {
  const o = rec(raw);
  const items = Array.isArray(raw) ? raw : Array.isArray(o?.incidents) ? o.incidents : Array.isArray(o?.result) ? o.result : [];
  return items.map(normalizeIncident).filter((i) => i.id);
}

/** Every JSON object found in a text, in order: inside a code fence, after prose, or bare. */
export function jsonObjectsIn(text: string): Rec[] {
  const found: Rec[] = [];
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (inString) {
        if (c === '\\') i++;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try {
          const parsed = rec(JSON.parse(text.slice(start, i + 1)));
          if (parsed) {
            found.push(parsed);
            start = i; // continue after this object, not inside it
          }
        } catch {
          /* not JSON from this brace; try the next one */
        }
        break;
      }
    }
  }
  return found;
}

/** Finds the first JSON object in a text, including one inside a code fence or after prose. */
export function firstJsonObject(text: string): Rec | undefined {
  return jsonObjectsIn(text)[0];
}

/**
 * Recognises the structured refusal the conventions define:
 * `{"error": "forbidden", "layer": "service", "rule": "<rule_name>", "message": "..."}`,
 * as an object or embedded in text.
 */
export function findRefusal(value: unknown): Refusal | undefined {
  if (typeof value === 'string') {
    return value.includes('"layer"') || value.includes('"rule"') ? findRefusal(firstJsonObject(value)) : undefined;
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = findRefusal(v);
      if (found) return found;
    }
    return undefined;
  }
  const o = rec(value);
  if (!o) return undefined;
  // The caller was allowed and the operation itself failed: a failure, not a refusal.
  if (o.error === 'operation_failed') return undefined;
  const layer = str(o.layer);
  if ((o.error === 'forbidden' || o.error === 'unauthorized') && (layer === 'service' || layer === 'gateway')) {
    return new Refusal({ layer, rule: str(o.rule), detail: str(o.message, o.detail) ?? 'no reason given' });
  }
  if (layer === 'service' && str(o.rule)) {
    return new Refusal({ layer: 'service', rule: str(o.rule), detail: str(o.message, o.detail) ?? 'no reason given' });
  }
  for (const key of ['refusal', 'error', 'result', 'detail', 'data', 'structuredContent']) {
    if (o[key] !== undefined && typeof o[key] !== 'boolean') {
      const found = findRefusal(o[key]);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * diagnosis-agent's answer ends with a JSON block holding `suspected_cause`,
 * `evidence` and `recommended_version`. Structured data is preferred if the
 * agent sends any, then the last such block in the text (the prose before it
 * may quote other JSON), then the text itself.
 */
export function normalizeDiagnosis(text: string, data: unknown[]): Diagnosis {
  const isDiagnosis = (d: Rec | undefined): d is Rec => !!d && !!(rec(d.diagnosis) ?? d).suspected_cause || !!d?.recommended_version;
  const structured = data.map(rec).find(isDiagnosis) ?? jsonObjectsIn(text).filter(isDiagnosis).at(-1);
  const d = rec(structured?.diagnosis) ?? structured;
  if (d && (d.suspected_cause || d.recommended_version)) {
    return {
      suspected_cause: str(d.suspected_cause, d.cause) ?? text.trim(),
      evidence: normalizeEvidence(d.evidence),
      recommended_version: str(d.recommended_version),
      text,
    };
  }
  const version = text.match(/(?:roll\s*back|rollback|revert|recommend\w*)[^.\n]*?\b(\d+\.\d+\.\d+)\b/i)?.[1];
  return { suspected_cause: text.trim(), evidence: [], recommended_version: version, text };
}
