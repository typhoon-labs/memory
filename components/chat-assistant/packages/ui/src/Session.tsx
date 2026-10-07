/**
 * The signed-in screen: a bar that names who is signed in (their role in the
 * role's color), the incident card, the chat pane beside it and, once there
 * is more than one incident, the list of incidents on its other side.
 *
 * The card is A2UI v0.9.1 rendered by A2UI's React renderer, with this app's
 * own drawing of the components it uses (see ./catalog). It arrives over A2A
 * and is kept current by a poll (about every 2 seconds), so one role's
 * approval appears for the others. A button click goes back as an A2UI action.
 *
 * The same poll brings the list. The card shows one incident: the current
 * one, or the one the viewer picked from the list, which the poll then names.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { Part } from '@a2a-js/sdk';
import { A2uiSurface, type ReactComponentImplementation } from '@a2ui/react/v0_9';
import { MessageProcessor, type ActionPayload, type SurfaceModel } from '@a2ui/web_core/v0_9';
import { CircleAlertIcon } from 'lucide-react';
import type { User } from 'oidc-client-ts';
import {
  A2UI_MIME_TYPE,
  A2UI_VERSION,
  AssistantClient,
  HttpError,
  SYNC_MIME_TYPE,
  a2uiMessagesIn,
  dataPart,
  pageIn,
  textIn,
  textPart,
  type IncidentListEntry,
} from './a2a';
import { viewerFrom, type Auth } from './auth';
import { catalog } from './catalog';
import type { Outcome } from './Callout';
import { ChatPane, type ChatEntry } from './ChatPane';
import type { RuntimeConfig } from './config';
import { EdgeButton, IncidentList } from './IncidentList';
import { CHAT_WIDTH, LIST_WIDTH, usePanels } from './usePanels';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TASK_COMPLETED = 3;
const TASK_FAILED = 4;
const TASK_REJECTED = 7;

/** What an action is called when the button that sent it cannot be found on the card. */
const ACTION_LABEL: Record<string, string> = {
  propose_rollback: 'Propose rollback',
  approve_change: 'Approve rollback',
  reject_change: 'Reject',
  apply_change: 'Apply rollback',
  restart_workload: 'Restart',
  draft_status_update: 'Draft status update',
  post_status_update: 'Post status update',
};

const sentence = (words: string) => `${words.charAt(0).toUpperCase()}${words.slice(1).replace(/[.\s]+$/, '')}.`;

/** The gateway refused the request to the chat assistant itself: nothing downstream was asked. */
const NOT_REACHED: Outcome = { tone: 'gateway', title: 'Refused by the gateway (HTTP 403)', text: 'You may not reach the chat assistant.' };

/** A refusal as the server describes it in a reply's metadata. */
interface RefusalFacts {
  layer?: string;
  rule?: string;
  title?: string;
  reason?: string;
  message?: string;
}

function refusalOutcome(refusal: RefusalFacts, text: string): Outcome {
  const service = refusal.layer === 'service';
  return {
    tone: service ? 'service' : 'gateway',
    title: refusal.title ?? (service ? 'Refused by the service' : 'Refused by the gateway'),
    text: refusal.reason ?? (refusal.message ? sentence(refusal.message) : text),
    rule: refusal.rule,
  };
}

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

  // The tab says whose it is, in its title and in the color and letter of its icon: the demo has
  // three roles open side by side.
  const page = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const who = role === 'other' ? viewer.user : role;
    document.title = `${who} | Incident chat`;
    const color = getComputedStyle(page.current!).getPropertyValue('--primary').trim();
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="4" fill="${color}"/><text x="8" y="12" text-anchor="middle" font-family="sans-serif" font-size="11" font-weight="700" fill="#fff">${who.charAt(0).toUpperCase()}</text></svg>`;
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute('href', `data:image/svg+xml,${encodeURIComponent(icon)}`);
  }, [role, viewer.user]);

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
  /** Bumped whenever A2UI is applied, so a slower, older poll response can be recognized and dropped. */
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

  // --- The list of incidents, and the one on the card ---
  const [incidents, setIncidents] = useState<IncidentListEntry[]>([]);
  /** The incident the server last put on the card, and the surface it is drawn on. */
  const [shown, setShown] = useState<{ id?: string; surfaceId?: string }>({});
  /** The incident the viewer picked from the list. None: the card follows the current incident. */
  const [picked, setPicked] = useState<string | null>(null);
  const pickedNow = useRef<string | null>(null);
  const pick = useCallback((id: string | null) => {
    pickedNow.current = id;
    setPicked(id);
  }, []);
  /** The incidents of the last poll, to tell when one has been opened since. */
  const known = useRef<Set<string> | null>(null);
  /** Asks for the page now, without waiting for the next poll. */
  const syncNow = useRef<() => void>(() => {});
  const panels = usePanels(incidents.length);

  // --- Poll: bring the list and the card up to date about every 2 seconds ---
  const [problem, setProblem] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    let again = false;
    const tick = async () => {
      if (stopped) return;
      if (inFlight) {
        // Asked for while one is on its way (the viewer picked an incident): ask again when it is back.
        again = true;
        return;
      }
      inFlight = true;
      const before = applied.current;
      const asked = pickedNow.current;
      try {
        const result = await client.send([dataPart({ request: 'sync', ...(asked ? { incident: asked } : {}) }, SYNC_MIME_TYPE)], metadata());
        if (stopped) return;
        const parts = 'parts' in result ? result.parts : result.status?.message?.parts;
        // The viewer picked another incident while this was on its way: it answers the question before.
        if (asked !== pickedNow.current) return;
        // Something newer (an action's stream) was applied while this was in flight: skip, the next poll catches up.
        if (before === applied.current) applyA2ui(parts);
        const now = pageIn(parts);
        if (now) {
          const ids = new Set(now.incidents.map((incident) => incident.id));
          const earlier = known.current;
          const opened = earlier !== null && now.incidents.some((incident) => incident.status !== 'resolved' && !earlier.has(incident.id));
          known.current = ids;
          // An incident opened since the last poll takes the card, whatever the viewer had picked.
          // So does the current one when the picked incident is gone (the incidents were cleared).
          if (asked && (opened || !ids.has(asked))) {
            pick(null);
            again = true;
          }
          setIncidents(now.incidents);
          setShown({ id: now.shown, surfaceId: now.surfaceId });
        }
        const text = textIn(parts);
        setProblem(text || null);
        setLoaded(true);
      } catch (err) {
        if (stopped) return;
        if (err instanceof HttpError && err.status === 401) setExpired(true);
        setProblem(
          err instanceof HttpError && err.status === 403
            ? `${NOT_REACHED.title}: you may not reach the chat assistant.`
            : `The chat assistant cannot be reached at ${config.a2aUrl}: ${err instanceof Error ? err.message : String(err)}`,
        );
      } finally {
        inFlight = false;
        if (again && !stopped) {
          again = false;
          void tick();
        }
      }
    };
    syncNow.current = () => void tick();
    void tick();
    const timer = window.setInterval(tick, config.pollIntervalMs);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [client, config, metadata, applyA2ui, pick]);

  const { dismissList } = panels;
  const onPick = useCallback(
    (id: string) => {
      pick(id);
      dismissList();
      window.scrollTo({ top: 0 });
      syncNow.current();
    },
    [pick, dismissList],
  );
  // A list that is open over the page is put away with Escape, as with a click beside it.
  useEffect(() => {
    if (panels.list !== 'over') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissList();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panels.list, dismissList]);

  // The bar at the top stays in place in a wide window, and the panels beside the card stand
  // under it. They need its height, which is not fixed: a notice can be shown under the bar.
  const head = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const measure = () => page.current?.style.setProperty('--head', `${head.current?.offsetHeight ?? 0}px`);
    measure();
    const observer = new ResizeObserver(measure);
    if (head.current) observer.observe(head.current);
    return () => observer.disconnect();
  }, []);

  // --- Chat pane ---
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const nextId = useRef(1);
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Scroll the log itself, not the page: `scrollIntoView` would also move the window, and a
    // viewer who has just pressed a button on the card would have the card pulled from under them.
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [chat, panels.chatOpen]);

  // Something arrived in the chat while it was closed (a button on the card reports there): the
  // button on the chat's edge says so until the chat is opened.
  const [news, setNews] = useState(false);
  const seen = useRef(chat);
  useEffect(() => {
    if (panels.chatOpen) {
      seen.current = chat;
      setNews(false);
    } else if (chat !== seen.current) setNews(true);
  }, [chat, panels.chatOpen]);

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
            const refusal = (message?.metadata as { refusal?: RefusalFacts } | undefined)?.refusal;
            const final = state === TASK_COMPLETED || state === TASK_FAILED || state === TASK_REJECTED;
            if (text || final) {
              revise(replyId, (e) => ({
                ...e,
                text: text || e.text,
                pending: !final,
                problem: refusal
                  ? refusalOutcome(refusal, text)
                  : state === TASK_FAILED
                    ? { tone: 'failed', title: 'Failed', text: text || 'No reason was given.' }
                    : e.problem,
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
          problem: gateway ? NOT_REACHED : { tone: 'failed', title: 'Failed', text: `The request failed: ${err instanceof Error ? err.message : String(err)}` },
        }));
      }
    },
    [client, metadata, applyA2ui, revise],
  );

  // A button on the card: send the A2UI action back, as the renderer resolved it. The chat pane
  // gets one entry for it, under the words that were on the button.
  onAction.current = (action) => {
    const { name, surfaceId, sourceComponentId, timestamp, context } = action;
    const parts = processor.model.surfacesMap.get(surfaceId)?.componentsModel;
    const words = parts?.get(String(parts.get(sourceComponentId)?.properties.child))?.properties.text;
    const replyId = say({ kind: 'action', label: typeof words === 'string' && words ? words : (ACTION_LABEL[name] ?? name), text: '', pending: true });
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
    say({ kind: 'you', text });
    const replyId = say({ kind: 'assistant', text: '', pending: true });
    await exchange([textPart(text)], replyId);
    setBusy(false);
  };

  const listShown = panels.list === 'docked' || panels.list === 'over';
  // The card on screen is the one the server last named. A surface for any other incident (an
  // action still streaming for the incident the viewer has just left) is not drawn.
  const visible = shown.surfaceId ? surfaces.filter((surface) => surface.id === shown.surfaceId) : surfaces;
  const columns = [panels.list === 'docked' && LIST_WIDTH, 'minmax(0, 1fr)', panels.chatOpen && CHAT_WIDTH].filter(Boolean).join(' ');

  return (
    // The window scrolls the incident. In a wide window the bar at the top, the list of incidents
    // and the chat stay in place while it does: the incident's scrollbar is then the window's, at
    // the far right, and does not run down the edge of the chat, where the chat's button stands.
    // In a narrow window there is one column, the incident first, and everything scrolls with it.
    <div ref={page} className={`role-${role} flex min-h-svh flex-col`}>
      <div ref={head} className="shrink-0 bg-background min-[60rem]:sticky min-[60rem]:top-0 min-[60rem]:z-20">
        {/* The line along the top and the role's name are in the role's color: with three roles
            open in three tabs, they say at a glance whose tab this is. */}
        <header className="flex min-h-12 shrink-0 items-center gap-3 border-b px-5 shadow-[inset_0_3px_0_var(--primary)]">
          <span className="font-semibold tracking-[-0.01em] whitespace-nowrap">Incident chat</span>
          <span className="rounded-md bg-primary px-2 text-sm leading-6 font-semibold whitespace-nowrap text-primary-foreground">
            {viewer.roles.join(', ') || 'no role'}
          </span>
          <span className="ml-auto min-w-0 truncate text-sm text-muted-foreground">
            Signed in as <strong className="font-medium text-foreground">{viewer.user}</strong>
            {viewer.team ? `, team ${viewer.team}` : null}
          </span>
          <Button variant="ghost" onClick={() => void auth.signOut()} className="h-[2.125rem] rounded-[7px] px-3 text-sm text-muted-foreground">
            Sign out
          </Button>
        </header>

        {(expired || problem) && (
          <div role="alert" className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-destructive-line bg-destructive-wash px-5 py-2 text-sm text-destructive">
            <CircleAlertIcon aria-hidden className="size-4 shrink-0" />
            {expired ? (
              <>
                Your session has expired.
                <Button variant="outline" onClick={() => void auth.signIn()} className="h-8 rounded-[7px] border-control px-3 text-sm text-foreground">
                  Sign in again
                </Button>
              </>
            ) : (
              problem
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 min-[60rem]:grid" style={{ gridTemplateColumns: columns }}>
        {panels.list !== 'none' && (
          <IncidentList
            incidents={incidents}
            selected={picked ?? shown.id}
            onPick={onPick}
            className={
              panels.list === 'docked'
                ? 'sticky top-[var(--head)] h-[calc(100svh_-_var(--head))] self-start'
                : panels.list === 'over'
                  ? 'fixed inset-y-0 left-0 z-30 w-60 shadow-[14px_0_36px_rgb(0_0_0/0.1)]'
                  : 'hidden'
            }
          />
        )}
        <main aria-label="Incident" className="px-5 pt-6 pb-8 min-[60rem]:px-10 min-[60rem]:pt-8 min-[60rem]:pb-12">
          <div className="mx-auto grid max-w-[45rem] gap-12">
            {visible.map((surface) => (
              <A2uiSurface key={surface.id} surface={surface} />
            ))}
            {visible.length === 0 &&
              (loaded && incidents.length === 0 ? (
                <div>
                  <h1 className="text-2xl leading-tight font-semibold tracking-[-0.022em]">No incident right now.</h1>
                  <p className="mt-2 text-muted-foreground">When an alert opens one, it appears here.</p>
                </div>
              ) : (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <i aria-hidden className="spinner size-3.5" />
                  Loading the incident…
                </p>
              ))}
          </div>
        </main>
        <ChatPane
          chat={chat}
          you={viewer.user}
          draft={draft}
          busy={busy}
          log={log}
          onDraft={setDraft}
          onSubmit={submit}
          className={cn(
            'min-[60rem]:sticky min-[60rem]:top-[var(--head)] min-[60rem]:h-[calc(100svh_-_var(--head))] min-[60rem]:self-start',
            !panels.chatOpen && 'min-[60rem]:hidden',
          )}
        />
      </div>

      {/* Open over the page, the list is put away by a click anywhere beside it. */}
      {panels.list === 'over' && <div aria-hidden className="fixed inset-0 z-20" onClick={dismissList} />}
      {panels.list !== 'none' && (
        <EdgeButton panel="left" open={listShown} name="the list of incidents" offset={listShown ? LIST_WIDTH : 0} onClick={panels.toggleList} />
      )}
      {!panels.oneColumn && (
        <EdgeButton panel="right" open={panels.chatOpen} name="the chat" offset={panels.chatOpen ? CHAT_WIDTH : 0} news={news} onClick={panels.toggleChat} />
      )}
    </div>
  );
}
