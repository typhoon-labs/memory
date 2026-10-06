/**
 * The signed-in screen: a header that shows who is signed in (coloured by
 * role), a chat pane, and the incident card.
 *
 * The card is A2UI v0.9.1 rendered by A2UI's React renderer. It arrives over
 * A2A and is kept current by a poll (about every 2 seconds), so one role's
 * approval appears for the others. A button click goes back as an A2UI action.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Part } from '@a2a-js/sdk';
import { renderMarkdown } from '@a2ui/markdown-it';
import { A2uiSurface, MarkdownContext, type ReactComponentImplementation } from '@a2ui/react/v0_9';
import { MessageProcessor, type ActionPayload, type SurfaceModel } from '@a2ui/web_core/v0_9';
import type { User } from 'oidc-client-ts';
import {
  A2UI_MIME_TYPE,
  A2UI_VERSION,
  AssistantClient,
  HttpError,
  SYNC_MIME_TYPE,
  a2uiMessagesIn,
  dataPart,
  textIn,
  textPart,
} from './a2a';
import { viewerFrom, type Auth } from './auth';
import { catalog } from './catalog';
import type { RuntimeConfig } from './config';

type Tone = 'plain' | 'done' | 'refused-gateway' | 'refused-service' | 'failed';

interface ChatEntry {
  id: number;
  from: 'you' | 'assistant';
  text: string;
  tone: Tone;
  pending?: boolean;
}

const TASK_COMPLETED = 3;
const TASK_FAILED = 4;
const TASK_REJECTED = 7;

const ACTION_LABEL: Record<string, string> = {
  propose_rollback: 'Propose rollback',
  approve_change: 'Approve',
  reject_change: 'Reject',
  apply_change: 'Apply rollback',
  restart_workload: 'Restart',
  draft_status_update: 'Draft status update',
  post_status_update: 'Post status update',
};

const KNOWN_ROLES = ['developer', 'incident-manager', 'platform-engineer'];

function useSurfaces(processor: MessageProcessor<ReactComponentImplementation>) {
  const [surfaces, setSurfaces] = useState<SurfaceModel<ReactComponentImplementation>[]>(() =>
    Array.from(processor.model.surfacesMap.values()),
  );
  useEffect(() => {
    const sync = () => setSurfaces(Array.from(processor.model.surfacesMap.values()));
    const created = processor.onSurfaceCreated(sync);
    const deleted = processor.onSurfaceDeleted(sync);
    sync();
    return () => {
      created.unsubscribe();
      deleted.unsubscribe();
    };
  }, [processor]);
  return surfaces;
}

export function Session({ config, auth }: { config: RuntimeConfig; auth: Auth }) {
  const [user, setUser] = useState<User>(auth.user!);
  const [expired, setExpired] = useState(false);
  const token = useRef(user.access_token);
  const viewer = useMemo(() => viewerFrom(user.access_token), [user]);
  const role = viewer.roles.find((r) => KNOWN_ROLES.includes(r)) ?? 'other';

  useEffect(() => {
    const loaded = (next: User) => {
      token.current = next.access_token;
      setUser(next);
      setExpired(false);
    };
    const onExpired = () => setExpired(true);
    auth.manager.events.addUserLoaded(loaded);
    auth.manager.events.addAccessTokenExpired(onExpired);
    return () => {
      auth.manager.events.removeUserLoaded(loaded);
      auth.manager.events.removeAccessTokenExpired(onExpired);
    };
  }, [auth]);

  const client = useMemo(() => new AssistantClient(config, () => token.current), [config]);

  // --- A2UI: the official message processor and React renderer ---
  const onAction = useRef<(action: ActionPayload) => void>(() => {});
  const processor = useMemo(
    () => new MessageProcessor<ReactComponentImplementation>([catalog], (action) => onAction.current(action)),
    [],
  );
  const surfaces = useSurfaces(processor);
  /** Bumped whenever A2UI is applied, so a slower, older poll response can be recognised and dropped. */
  const applied = useRef(0);

  const applyA2ui = useCallback(
    (parts: Part[] | undefined) => {
      const messages = a2uiMessagesIn(parts);
      for (const message of messages) {
        try {
          // One at a time: a message that fails must not stop the ones after it.
          processor.processMessages([message] as never);
        } catch (err) {
          console.error('A2UI message rejected', message, err);
        }
      }
      if (messages.length) applied.current++;
    },
    [processor],
  );

  /** Sent with every request: what this renderer supports and, per surface, its data model (Data Model Sync). */
  const metadata = useCallback((): Record<string, unknown> => {
    const dataModel = processor.getRendererDataModel(A2UI_VERSION as never);
    return {
      a2uiClientCapabilities: { [A2UI_VERSION]: { supportedCatalogIds: [catalog.id] } },
      ...(dataModel ? { a2uiClientDataModel: dataModel } : {}),
    };
  }, [processor]);

  // --- Poll: bring the card up to date about every 2 seconds ---
  const [problem, setProblem] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    const tick = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      const before = applied.current;
      try {
        const result = await client.send([dataPart({ request: 'sync' }, SYNC_MIME_TYPE)], metadata());
        if (stopped) return;
        const parts = 'parts' in result ? result.parts : result.status?.message?.parts;
        // Something newer (an action's stream) was applied while this was in flight: skip, the next poll catches up.
        if (before === applied.current) applyA2ui(parts);
        const text = textIn(parts);
        setProblem(text || null);
        setLoaded(true);
      } catch (err) {
        if (stopped) return;
        if (err instanceof HttpError && err.status === 401) setExpired(true);
        setProblem(
          err instanceof HttpError && err.status === 403
            ? 'Refused by the gateway (HTTP 403): you may not reach the chat assistant.'
            : `The chat assistant cannot be reached at ${config.a2aUrl}: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        inFlight = false;
      }
    };
    void tick();
    const timer = window.setInterval(tick, config.pollIntervalMs);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [client, config, metadata, applyA2ui]);

  // --- Chat pane ---
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const nextId = useRef(1);
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll the log itself, not the page: `scrollIntoView` would also move the window, and a
    // viewer who has just pressed a button on the card would have the card pulled from under them.
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [chat]);

  const say = useCallback((entry: Omit<ChatEntry, 'id'>) => {
    const id = nextId.current++;
    setChat((log) => [...log, { ...entry, id }]);
    return id;
  }, []);
  const revise = useCallback((id: number, change: (entry: ChatEntry) => ChatEntry) => {
    setChat((log) => log.map((entry) => (entry.id === id ? change(entry) : entry)));
  }, []);

  /** Sends parts over the streaming method and folds the SSE events into one chat entry. */
  const exchange = useCallback(
    async (parts: Part[], replyId: number) => {
      try {
        for await (const event of client.stream(parts, metadata())) {
          const payload = event.payload;
          if (payload?.$case === 'artifactUpdate') {
            const delta = textIn(payload.value.artifact?.parts);
            if (delta) revise(replyId, (e) => ({ ...e, text: e.text + delta }));
          } else if (payload?.$case === 'statusUpdate' || payload?.$case === 'message') {
            const message = payload.$case === 'message' ? payload.value : payload.value.status?.message;
            const state = payload.$case === 'statusUpdate' ? payload.value.status?.state : TASK_COMPLETED;
            applyA2ui(message?.parts);
            const text = textIn(message?.parts);
            const refusal = (message?.metadata as { refusal?: { layer?: string } } | undefined)?.refusal;
            const final = state === TASK_COMPLETED || state === TASK_FAILED || state === TASK_REJECTED;
            if (text || final) {
              revise(replyId, (e) => ({
                ...e,
                text: text || e.text,
                pending: !final,
                tone:
                  refusal?.layer === 'gateway'
                    ? 'refused-gateway'
                    : refusal?.layer === 'service'
                      ? 'refused-service'
                      : state === TASK_FAILED
                        ? 'failed'
                        : e.tone,
              }));
            }
          }
        }
        revise(replyId, (e) => ({ ...e, pending: false, text: e.text || 'No answer.' }));
      } catch (err) {
        const gateway = err instanceof HttpError && err.status === 403;
        if (err instanceof HttpError && err.status === 401) setExpired(true);
        revise(replyId, (e) => ({
          ...e,
          pending: false,
          tone: gateway ? 'refused-gateway' : 'failed',
          text: gateway
            ? 'Refused by the gateway (HTTP 403): you may not reach the chat assistant.'
            : `The request failed: ${err instanceof Error ? err.message : String(err)}`,
        }));
      }
    },
    [client, metadata, applyA2ui, revise],
  );

  // A button on the card: send the A2UI action back, as the renderer resolved it.
  onAction.current = (action) => {
    say({ from: 'you', text: ACTION_LABEL[action.name] ?? action.name, tone: 'plain' });
    const replyId = say({ from: 'assistant', text: '', tone: 'done', pending: true });
    const { name, surfaceId, sourceComponentId, timestamp, context } = action;
    void exchange(
      [dataPart([{ version: A2UI_VERSION, action: { name, surfaceId, sourceComponentId, timestamp, context } }], A2UI_MIME_TYPE)],
      replyId,
    );
  };

  const [draft, setDraft] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setBusy(true);
    say({ from: 'you', text, tone: 'plain' });
    const replyId = say({ from: 'assistant', text: '', tone: 'plain', pending: true });
    await exchange([textPart(text)], replyId);
    setBusy(false);
  };

  return (
    <div className={`app role-${role}`}>
      <header className="banner">
        <div className="who">
          <span className="role">{viewer.roles.join(', ') || 'no role'}</span>
          <span>
            Signed in as <strong>{viewer.user}</strong>
            {viewer.team ? <> · team {viewer.team}</> : null}
          </span>
        </div>
        <button onClick={() => void auth.signOut()}>Sign out</button>
      </header>

      {expired && (
        <div className="strip problem" role="alert">
          Your session has expired.{' '}
          <button onClick={() => void auth.signIn()}>Sign in again</button>
        </div>
      )}
      {problem && !expired && (
        <div className="strip problem" role="alert">
          {problem}
        </div>
      )}

      <main className="panes">
        <section className="pane chat" aria-label="Chat">
          <h2>Chat</h2>
          <div className="log" aria-live="polite" ref={log}>
            {chat.length === 0 && <p className="fine">Ask about the incident, or use the buttons on the card.</p>}
            {chat.map((entry) => (
              <div key={entry.id} className={`entry ${entry.from} ${entry.tone}`}>
                <span className="speaker">
                  {entry.from === 'you'
                    ? viewer.user
                    : entry.tone === 'refused-gateway'
                      ? 'Refused by the gateway'
                      : entry.tone === 'refused-service'
                        ? 'Refused by the service'
                        : entry.tone === 'failed'
                          ? 'Failed'
                          : 'Assistant'}
                </span>
                <p>{entry.text || (entry.pending ? 'Working…' : '')}</p>
              </div>
            ))}
          </div>
          <form className="ask" onSubmit={submit}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about the incident"
              aria-label="Message"
              disabled={busy}
            />
            <button className="primary" type="submit" disabled={busy || !draft.trim()}>
              Send
            </button>
          </form>
        </section>

        <section className="pane card" aria-label="Incident">
          <h2>Incident</h2>
          <MarkdownContext.Provider value={renderMarkdown}>
            <div className="a2ui-host">
              {surfaces.map((surface) => (
                <A2uiSurface key={surface.id} surface={surface} />
              ))}
            </div>
          </MarkdownContext.Provider>
          {surfaces.length === 0 && <p className="fine">{loaded ? 'No incident right now.' : 'Loading the incident…'}</p>}
        </section>
      </main>
    </div>
  );
}
