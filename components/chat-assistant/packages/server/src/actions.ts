/**
 * Button actions. Each one is a direct call, made by this code as the
 * signed-in caller, to the tool or agent the conventions name for it:
 *
 *   propose, approve, reject, restart, post  -> delivery-mcp (MCP tool)
 *   apply                                    -> remediation-agent (A2A)
 *   draft                                    -> comms-agent (A2A)
 *
 * No model decides whether an action runs, and this code does not decide
 * whether it is allowed: the caller's token goes downstream and the gateway
 * and the service answer. A "no" comes back as a Refusal that names its layer.
 */
import type { A2uiAction } from './a2a/wire.js';
import type { Identity } from './auth.js';
import { ACTIONS } from './card/incident-card.js';
import { firstJsonObject } from './downstream/normalize.js';
import { Refusal, type AgentReply, type Downstreams, type RefusalLayer } from './downstream/types.js';

export interface ActionOutcome {
  action: string;
  ok: boolean;
  /** One sentence for the chat pane and the card's notice line. */
  text: string;
  refusal?: { layer: RefusalLayer; rule?: string; status?: number; message: string };
  /** Set by the draft action. */
  draft?: string;
  incidentId?: string;
}

class BadAction extends Error {}

function need(context: Record<string, unknown>, key: string): string {
  const value = context[key];
  if (typeof value !== 'string' || !value.trim()) throw new BadAction(`The action is missing "${key}".`);
  if (value.length > 4000) throw new BadAction(`"${key}" is too long.`);
  return value.trim();
}

function draftFrom(reply: AgentReply): string {
  for (const item of [...reply.data, firstJsonObject(reply.text)]) {
    const o = item as { draft?: unknown; text?: unknown } | undefined;
    if (o && typeof o === 'object') {
      if (typeof o.draft === 'string' && o.draft.trim()) return o.draft.trim();
      if (typeof o.text === 'string' && o.text.trim()) return o.text.trim();
    }
  }
  return reply.text.trim();
}

export async function performAction(d: Downstreams, identity: Identity, action: A2uiAction): Promise<ActionOutcome> {
  const { token } = identity;
  const c = action.context ?? {};
  const incidentId = typeof c.incident_id === 'string' ? c.incident_id : undefined;
  const done = (text: string, extra: Partial<ActionOutcome> = {}): ActionOutcome => ({
    action: action.name,
    ok: true,
    text,
    incidentId,
    ...extra,
  });

  try {
    switch (action.name) {
      case ACTIONS.propose: {
        const target = need(c, 'target_version');
        await d.delivery.callTool(token, 'propose_change', { incident_id: need(c, 'incident_id'), target_version: target });
        return done(`Rollback to ${target} proposed. An incident-manager can now approve it.`);
      }
      case ACTIONS.approve:
        await d.delivery.callTool(token, 'approve_change', { change_id: need(c, 'change_id') });
        return done('Change approved. A platform-engineer can now apply it.');
      case ACTIONS.reject:
        await d.delivery.callTool(token, 'reject_change', { change_id: need(c, 'change_id'), reason: need(c, 'reason') });
        return done('Change rejected.');
      case ACTIONS.apply: {
        const reply = await d.remediation.applyAndVerify(token, need(c, 'change_id'));
        return done(reply.text.trim() || 'Rollback applied and verified.');
      }
      case ACTIONS.restart: {
        const service = need(c, 'service');
        await d.delivery.callTool(token, 'restart_workload', { service });
        return done(`${service} restarted.`);
      }
      case ACTIONS.draft: {
        const reply = await d.comms.draftStatusUpdate(token, need(c, 'incident_id'));
        return done('Status update drafted. Edit it on the card, then post it.', { draft: draftFrom(reply) });
      }
      case ACTIONS.post:
        await d.delivery.callTool(token, 'post_status_update', { incident_id: need(c, 'incident_id'), text: need(c, 'text') });
        return done('Status update posted.');
      default:
        throw new BadAction(`Unknown action "${action.name}".`);
    }
  } catch (err) {
    if (err instanceof Refusal) {
      return {
        action: action.name,
        ok: false,
        text: err.message,
        refusal: { layer: err.layer, rule: err.rule, status: err.status, message: err.detail },
        incidentId,
      };
    }
    const text = err instanceof BadAction ? err.message : `The action failed: ${err instanceof Error ? err.message : String(err)}`;
    return { action: action.name, ok: false, text, incidentId };
  }
}
