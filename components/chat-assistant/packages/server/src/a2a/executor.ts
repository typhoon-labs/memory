/**
 * The A2A executor. One incoming message is exactly one of:
 *
 *   - an A2UI action (a data part with `metadata.mimeType: application/a2ui+json`
 *     holding `[{version, action: {name, surfaceId, sourceComponentId, context}}]`)
 *       -> handled by code (../actions.ts), as a task that ends completed,
 *          rejected (a refusal) or failed;
 *   - a sync request (our own data part, `application/vnd.chat-assistant.sync+json`,
 *     `{request: "sync"}`, with `incident` when the viewer has picked one from
 *     the list)
 *       -> answered with a plain message carrying the list of incidents and
 *          whatever A2UI messages bring the caller's card up to date;
 *   - text
 *       -> the Mastra chat agent, streamed as artifact updates.
 *
 * A2UI travels back in a data part whose `data` is the array of messages.
 */
import { TaskState, type Message, type Part } from '@a2a-js/sdk';
import { AgentEvent, type AgentExecutor, type ExecutionEventBus, type RequestContext, type User } from '@a2a-js/sdk/server';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import { performAction, type ActionOutcome } from '../actions.js';
import type { Identity } from '../auth.js';
import { ACTIONS, NOTICE_SLOT, NO_NOTICE, buildIncidentCard, surfaceIdFor, type CardSurface, type Notice } from '../card/incident-card.js';
import { buildIncidentList, type IncidentListEntry } from '../card/incident-list.js';
import { applyToClientView, clientSurfacesFrom, syncMessages, type ClientSurfaces } from '../card/sync.js';
import type { Chat } from '../chat/agent.js';
import type { DiagnosisTracker } from '../diagnosis-status.js';
import { incidentsFor } from '../downstream/index.js';
import { Refusal, refusalText, refusalWords, type Downstreams } from '../downstream/types.js';
import {
  A2UI_EXTENSION_URI,
  INCIDENT_CATALOG_ID,
  SYNC_MIME_TYPE,
  a2uiMessagesOf,
  a2uiPart,
  agentMessage,
  clientCatalogs,
  dataPart,
  isA2uiPart,
  partMimeType,
  textOf,
  textPart,
  type A2uiAction,
} from './wire.js';

const tracer = trace.getTracer('chat-assistant');

/** The verified caller, as the A2A SDK carries it to the executor. */
export class CallerUser implements User {
  constructor(readonly identity: Identity) {}
  get isAuthenticated() {
    return true;
  }
  get userName() {
    return this.identity.user;
  }
}

function findAction(parts: Part[]): A2uiAction | undefined {
  for (const part of parts.filter(isA2uiPart)) {
    for (const message of a2uiMessagesOf(part)) {
      const a = message.action as Partial<A2uiAction> | undefined;
      if (a && typeof a.name === 'string') {
        return {
          name: a.name,
          surfaceId: String(a.surfaceId ?? ''),
          sourceComponentId: String(a.sourceComponentId ?? ''),
          timestamp: a.timestamp,
          context: a.context && typeof a.context === 'object' ? a.context : {},
        };
      }
    }
  }
  return undefined;
}

/** The incident a sync request names: the one the viewer picked from the list. Without one, the current incident is shown. */
function pickedIncident(parts: Part[]): string | undefined {
  for (const part of parts) {
    if (part.content?.$case !== 'data' || partMimeType(part) !== SYNC_MIME_TYPE) continue;
    const picked = (part.content.value as { incident?: unknown } | null)?.incident;
    if (typeof picked === 'string' && picked) return picked;
  }
  return undefined;
}

/**
 * The incident an action is about: the one its context names, as every button
 * on the card does, or else the one whose card the client says it was sent from.
 */
function incidentOf(action: A2uiAction, held: ClientSurfaces): string | undefined {
  const named = action.context.incident_id;
  if (typeof named === 'string' && named) return named;
  const meta = (held[action.surfaceId] as { meta?: { incidentId?: unknown } } | undefined)?.meta;
  return typeof meta?.incidentId === 'string' && meta.incidentId ? meta.incidentId : undefined;
}

/**
 * Whether the client can draw the card. A2UI: the agent picks a catalog the
 * client supports, and sends no UI if there is none. A client that states no
 * capabilities has expressed no preference and is sent the card.
 */
function drawsTheCard(message: Message): boolean {
  return clientCatalogs(message.metadata)?.includes(INCIDENT_CATALOG_ID) ?? true;
}

/** What a refused or failed action leaves beside the button that was pressed; nothing when it went through. */
function noticeFor(action: A2uiAction, outcome: ActionOutcome): Notice {
  if (outcome.ok) return NO_NOTICE;
  const slot = NOTICE_SLOT[action.name] ?? '';
  const { refusal } = outcome;
  return refusal
    ? { slot, tone: refusal.layer, title: refusal.title, text: refusal.reason, rule: refusal.rule ?? '' }
    : { slot, tone: 'failed', title: 'Failed', text: outcome.text, rule: '' };
}

/** An HTTP status buried in an error chain (the model provider's errors carry `statusCode`). */
function httpStatusOf(err: unknown): number | undefined {
  for (let e: any = err, depth = 0; e && depth < 6; e = e.cause, depth++) {
    const status = e.statusCode ?? e.status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

export class ChatAssistantExecutor implements AgentExecutor {
  private readonly running = new Map<string, AbortController>();

  constructor(
    private readonly downstreams: Downstreams,
    private readonly chat: Chat,
    /** How often the card is re-read and pushed while an action is running. */
    private readonly progressIntervalMs = 1000,
    /** All the time one chat answer may take. A model that is slow or hangs is given up on then. */
    private readonly modelTimeoutMs = 60_000,
    private readonly diagnoses?: DiagnosisTracker,
  ) {}

  async execute(rc: RequestContext, bus: ExecutionEventBus): Promise<void> {
    const user = rc.context.user;
    if (!(user instanceof CallerUser)) throw new Error('unauthenticated request reached the executor');
    const identity = user.identity;
    const message = rc.userMessage;
    if (rc.context.requestedExtensions?.includes(A2UI_EXTENSION_URI)) rc.context.addActivatedExtension(A2UI_EXTENSION_URI);

    const action = findAction(message.parts);
    const isSync = message.parts.some((p) => p.content?.$case === 'data' && partMimeType(p) === SYNC_MIME_TYPE);
    const text = textOf(message.parts).trim();
    const kind = action ? 'action' : isSync ? 'sync' : text ? 'chat' : 'empty';

    await tracer.startActiveSpan(
      `chat-assistant ${kind}${action ? ` ${action.name}` : ''}`,
      { attributes: { 'enduser.id': identity.user, 'enduser.role': identity.roles.join(','), 'a2a.context_id': rc.contextId } },
      async (span) => {
        try {
          if (action) await this.runAction(rc, bus, identity, action, message);
          else if (isSync) await this.runSync(rc, bus, identity, message);
          else if (text) await this.runChat(rc, bus, identity, text);
          else {
            bus.publish(
              AgentEvent.message(
                agentMessage({ contextId: rc.contextId, parts: [textPart('Send text, an A2UI action, or a sync request.')] }),
              ),
            );
          }
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw err;
        } finally {
          span.end();
          bus.finished();
        }
      },
    );
  }

  async cancelTask(taskId: string, bus: ExecutionEventBus): Promise<void> {
    this.running.get(taskId)?.abort();
    bus.publish(
      AgentEvent.statusUpdate({
        taskId,
        contextId: '',
        status: { state: TaskState.TASK_STATE_CANCELED, message: undefined, timestamp: new Date().toISOString() },
        metadata: undefined,
      }),
    );
    bus.finished();
  }

  /**
   * What this caller's page shows now, read as the caller: the list of
   * incidents, and the card of one of them. That is the incident `picked`, if
   * it exists, and otherwise the current one; with no incident there is no card.
   */
  private async page(identity: Identity, picked?: string): Promise<{ cards: CardSurface[]; incidents: IncidentListEntry[]; shown?: string }> {
    const { all, shown } = await incidentsFor(this.downstreams, identity.token, picked);
    return {
      // Until the record carries a diagnosis, show where the alert hook's diagnosis stands.
      cards: shown ? [buildIncidentCard(shown, identity, shown.suspected_cause ? undefined : this.diagnoses?.get(shown.id))] : [],
      incidents: buildIncidentList(all),
      shown: shown?.id,
    };
  }

  private async runSync(rc: RequestContext, bus: ExecutionEventBus, identity: Identity, message: Message) {
    const viewer = { user: identity.user, roles: identity.roles, team: identity.team };
    if (!drawsTheCard(message)) {
      bus.publish(
        AgentEvent.message(
          agentMessage({
            contextId: rc.contextId,
            parts: [
              dataPart({ viewer, surfaces: [], error: true }, SYNC_MIME_TYPE),
              textPart(`This client cannot draw the incident card: it does not support the catalog ${INCIDENT_CATALOG_ID}.`),
            ],
            metadata: { error: true },
          }),
        ),
      );
      return;
    }
    try {
      const { cards: desired, incidents, shown } = await this.page(identity, pickedIncident(message.parts));
      const a2ui = syncMessages(desired, clientSurfacesFrom(message.metadata));
      const state = {
        viewer,
        surfaces: desired.map((s) => ({ surfaceId: s.surfaceId, incidentId: s.incidentId, version: s.version })),
        // For the list beside the card: every incident, and which one the card shows.
        incidents,
        shown,
      };
      bus.publish(
        AgentEvent.message(
          agentMessage({
            contextId: rc.contextId,
            parts: [dataPart(state, SYNC_MIME_TYPE), ...(a2ui.length ? [a2uiPart(a2ui)] : [])],
          }),
        ),
      );
    } catch (err) {
      const refusal = err instanceof Refusal ? err : undefined;
      bus.publish(
        AgentEvent.message(
          agentMessage({
            contextId: rc.contextId,
            parts: [
              dataPart({ viewer, surfaces: [], error: true }, SYNC_MIME_TYPE),
              textPart(refusal ? refusal.message : `The incident could not be read: ${err instanceof Error ? err.message : String(err)}`),
            ],
            metadata: refusal ? { refusal: refusal.toJSON() } : { error: true },
          }),
        ),
      );
    }
  }

  private startTask(rc: RequestContext, bus: ExecutionEventBus) {
    bus.publish(
      AgentEvent.task({
        id: rc.taskId,
        contextId: rc.contextId,
        status: { state: TaskState.TASK_STATE_WORKING, message: undefined, timestamp: new Date().toISOString() },
        artifacts: [],
        history: [],
        metadata: undefined,
      }),
    );
  }

  private status(rc: RequestContext, bus: ExecutionEventBus, state: TaskState, parts: Part[], metadata?: Record<string, unknown>) {
    bus.publish(
      AgentEvent.statusUpdate({
        taskId: rc.taskId,
        contextId: rc.contextId,
        status: {
          state,
          message: parts.length ? agentMessage({ contextId: rc.contextId, taskId: rc.taskId, parts, metadata }) : undefined,
          timestamp: new Date().toISOString(),
        },
        metadata,
      }),
    );
  }

  private async runAction(rc: RequestContext, bus: ExecutionEventBus, identity: Identity, action: A2uiAction, message: Message) {
    this.startTask(rc, bus);
    const draws = drawsTheCard(message);
    let view: ClientSurfaces = clientSurfacesFrom(message.metadata);
    // The card stays on the incident the button belongs to, whichever incident is current.
    const viewing = incidentOf(action, view);

    // While a slow action runs (apply and verify), push the card as it changes.
    // A quick action finishes before the first tick and is not held up by it.
    let finished = false;
    let wake = () => {};
    const done = new Promise<void>((resolve) => (wake = resolve));
    const progress = (async () => {
      while (!finished) {
        let timer: NodeJS.Timeout | undefined;
        await Promise.race([done, new Promise((resolve) => (timer = setTimeout(resolve, this.progressIntervalMs)))]);
        clearTimeout(timer);
        if (finished) break;
        try {
          const { cards: desired } = await this.page(identity, viewing);
          const a2ui = draws ? syncMessages(desired, view) : [];
          if (a2ui.length && !finished) {
            this.status(rc, bus, TaskState.TASK_STATE_WORKING, [a2uiPart(a2ui)]);
            view = applyToClientView(view, desired);
          }
        } catch {
          /* progress is best effort; the final update reports problems */
        }
      }
    })();

    let outcome: ActionOutcome;
    try {
      outcome = await performAction(this.downstreams, identity, action);
    } finally {
      finished = true;
      wake();
      await progress;
    }

    const parts: Part[] = [textPart(outcome.text)];
    try {
      const { cards: desired } = await this.page(identity, viewing);
      const target = desired.find((s) => s.surfaceId === action.surfaceId)?.surfaceId ?? surfaceIdFor(outcome.incidentId ?? '');
      const a2ui = !draws ? [] : syncMessages(desired, view, {
        [target]: {
          notice: noticeFor(action, outcome),
          // A new draft fills the field; a posted update or a completed rejection clears its field.
          draft: outcome.draft ?? (outcome.ok && action.name === ACTIONS.post ? '' : undefined),
          rejectReason: outcome.ok && action.name === ACTIONS.reject ? '' : undefined,
        },
      });
      if (a2ui.length) parts.push(a2uiPart(a2ui));
    } catch {
      /* the outcome text still reaches the user; the next poll refreshes the card */
    }

    const state = outcome.ok
      ? TaskState.TASK_STATE_COMPLETED
      : outcome.refusal
        ? TaskState.TASK_STATE_REJECTED
        : TaskState.TASK_STATE_FAILED;
    this.status(rc, bus, state, parts, {
      action: outcome.action,
      ok: outcome.ok,
      ...(outcome.refusal ? { refusal: outcome.refusal } : {}),
    });
  }

  private async runChat(rc: RequestContext, bus: ExecutionEventBus, identity: Identity, text: string) {
    this.startTask(rc, bus);
    const abort = new AbortController();
    this.running.set(rc.taskId, abort);
    const deadline = AbortSignal.timeout(this.modelTimeoutMs);
    const timedOut = () => {
      const seconds = this.modelTimeoutMs / 1000;
      this.status(rc, bus, TaskState.TASK_STATE_FAILED, [
        textPart(`The model did not answer within ${seconds} second${seconds === 1 ? '' : 's'}.`),
      ]);
    };
    let first = true;
    try {
      const reply = await this.chat.reply({
        identity,
        contextId: rc.contextId,
        text,
        signal: AbortSignal.any([abort.signal, deadline]),
        onDelta: (delta) => {
          bus.publish(
            AgentEvent.artifactUpdate({
              taskId: rc.taskId,
              contextId: rc.contextId,
              artifact: {
                artifactId: `${rc.taskId}-reply`,
                name: 'reply',
                description: '',
                parts: [textPart(delta)],
                metadata: undefined,
                extensions: [],
              },
              append: !first,
              lastChunk: false,
              metadata: undefined,
            }),
          );
          first = false;
        },
      });
      if (abort.signal.aborted) return;
      // An aborted stream may simply end; what was received by then is not the answer.
      if (deadline.aborted) return timedOut();
      this.status(rc, bus, TaskState.TASK_STATE_COMPLETED, reply ? [] : [textPart('The model returned no answer.')]);
    } catch (err) {
      if (abort.signal.aborted) return;
      if (deadline.aborted) return timedOut();
      const status = httpStatusOf(err);
      if (status === 401 || status === 403) {
        const refusal = { layer: 'gateway' as const, status, detail: 'the model call was not allowed for you' };
        this.status(rc, bus, TaskState.TASK_STATE_REJECTED, [textPart(refusalText(refusal))], {
          refusal: { layer: refusal.layer, status, message: refusal.detail, ...refusalWords(refusal) },
        });
      } else {
        this.status(rc, bus, TaskState.TASK_STATE_FAILED, [
          textPart(`The model call failed: ${err instanceof Error ? err.message : String(err)}`),
        ]);
      }
    } finally {
      this.running.delete(rc.taskId);
    }
  }
}
