/**
 * The browser's A2A client: JSON-RPC over HTTP, with Server-Sent Events for
 * streaming, using the official A2A JavaScript SDK client.
 *
 * - Every request carries the signed-in user's bearer token.
 * - The A2UI extension is requested with `X-A2A-Extensions` (the name in the
 *   A2UI specification) and `A2A-Extensions` (the name in A2A 1.0).
 * - Requests go to the URL from /config.json (the gateway route), whatever URL
 *   the agent card advertises.
 */
import type { AgentCard, Message, Part, StreamResponse, Task } from '@a2a-js/sdk';
import { ClientFactory, DefaultAgentCardResolver, JsonRpcTransportFactory, type Client } from '@a2a-js/sdk/client';
import type { RuntimeConfig } from './config';

export const A2UI_EXTENSION_URI = 'https://a2ui.org/a2a-extension/a2ui/v0.9.1';
export const A2UI_MIME_TYPE = 'application/a2ui+json';
export const A2UI_VERSION = 'v0.9.1';
export const SYNC_MIME_TYPE = 'application/vnd.chat-assistant.sync+json';

const ROLE_USER = 1;
const legacyCompat = { enabled: true };

export class HttpError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`HTTP ${status}${body ? `: ${body.slice(0, 200)}` : ''}`);
  }
}

export function textPart(text: string): Part {
  return { content: { $case: 'text', value: text }, metadata: undefined, filename: '', mediaType: '' };
}

export function dataPart(value: unknown, mimeType: string): Part {
  return { content: { $case: 'data', value }, metadata: { mimeType }, filename: '', mediaType: mimeType };
}

function mimeOf(part: Part): string {
  const fromMetadata = part.metadata?.mimeType;
  return typeof fromMetadata === 'string' && fromMetadata ? fromMetadata : part.mediaType;
}

/**
 * The A2UI messages carried by a part. `data` is an array of messages; an
 * A2A 0.3 peer may have wrapped the array as `{value: [...]}`, and some agents
 * send one message per part.
 */
export function a2uiMessagesIn(parts: Part[] | undefined): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const part of parts ?? []) {
    if (part.content?.$case !== 'data' || mimeOf(part) !== A2UI_MIME_TYPE) continue;
    const value = part.content.value as unknown;
    const list = Array.isArray(value)
      ? value
      : value && typeof value === 'object' && Array.isArray((value as { value?: unknown }).value)
        ? (value as { value: unknown[] }).value
        : [value];
    for (const m of list) if (m && typeof m === 'object' && !Array.isArray(m)) out.push(m as Record<string, unknown>);
  }
  return out;
}

export function textIn(parts: Part[] | undefined): string {
  return (parts ?? []).map((p) => (p.content?.$case === 'text' ? p.content.value : '')).join('');
}

/** One row of the list of incidents, as the server builds it (packages/server/src/card/incident-list.ts). */
export interface IncidentListEntry {
  id: string;
  service: string;
  summary: string;
  /** `open`, `mitigating` or `resolved`. */
  status: string;
  /** When it was resolved, as `HH:MM` in UTC; empty while it is not. */
  resolved: string;
  /** Where its change stands, in a few words. */
  note: string;
}

/** What a sync reply says beside the card: every incident, and which one the card shows. */
export interface Page {
  incidents: IncidentListEntry[];
  /** The incident on the card, and the surface it is drawn on. Absent when there is no incident. */
  shown?: string;
  surfaceId?: string;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

/** The page a sync reply describes. Undefined when the reply carries none: it failed, and what is on screen stays. */
export function pageIn(parts: Part[] | undefined): Page | undefined {
  for (const part of parts ?? []) {
    if (part.content?.$case !== 'data' || mimeOf(part) !== SYNC_MIME_TYPE) continue;
    const state = part.content.value as { incidents?: unknown; shown?: unknown; surfaces?: unknown } | null;
    if (!state || !Array.isArray(state.incidents)) return undefined;
    const incidents = (state.incidents as Record<string, unknown>[])
      .filter((i) => i && typeof i === 'object' && text(i.id))
      .map((i) => ({ id: text(i.id), service: text(i.service), summary: text(i.summary), status: text(i.status), resolved: text(i.resolved), note: text(i.note) }));
    const surfaces = Array.isArray(state.surfaces) ? (state.surfaces as { surfaceId?: unknown }[]) : [];
    return { incidents, shown: text(state.shown) || undefined, surfaceId: text(surfaces[0]?.surfaceId) || undefined };
  }
  return undefined;
}

export class AssistantClient {
  private client?: Promise<Client>;
  private readonly contextId = crypto.randomUUID();

  constructor(
    private readonly config: RuntimeConfig,
    private readonly accessToken: () => string,
  ) {}

  private fetchImpl: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('Authorization', `Bearer ${this.accessToken()}`);
    headers.set('X-A2A-Extensions', A2UI_EXTENSION_URI);
    headers.set('A2A-Extensions', A2UI_EXTENSION_URI);
    const res = await fetch(input, { ...init, headers });
    if (res.status === 401 || res.status === 403) throw new HttpError(res.status, await res.text().catch(() => ''));
    return res;
  };

  private connect(): Promise<Client> {
    this.client ??= (async () => {
      const { a2aUrl, a2aProtocolVersion } = this.config;
      // The resolver joins the card path onto the base as a relative URL, so a base with a path
      // (the gateway route /a2a/chat-assistant) must end in a slash or its last segment is lost.
      const card: AgentCard = await new DefaultAgentCardResolver({ fetchImpl: this.fetchImpl, legacyCompat }).resolve(`${a2aUrl}/`);
      const interfaces = card.supportedInterfaces
        .filter((i) => i.protocolBinding === 'JSONRPC' && i.protocolVersion === a2aProtocolVersion)
        .map((i) => ({ ...i, url: a2aUrl }));
      if (!interfaces.length) throw new Error(`The agent offers no JSON-RPC interface for A2A ${a2aProtocolVersion}.`);
      const factory = new ClientFactory({ transports: [new JsonRpcTransportFactory({ fetchImpl: this.fetchImpl, legacyCompat })] });
      return factory.createFromAgentCard({ ...card, supportedInterfaces: interfaces });
    })();
    this.client.catch(() => (this.client = undefined));
    return this.client;
  }

  private request(parts: Part[], metadata: Record<string, unknown>) {
    return {
      tenant: '',
      message: {
        messageId: crypto.randomUUID(),
        contextId: this.contextId,
        taskId: '',
        role: ROLE_USER,
        parts,
        metadata,
        extensions: [A2UI_EXTENSION_URI],
        referenceTaskIds: [],
      } satisfies Message,
      configuration: undefined,
      metadata: undefined,
    };
  }

  /** One JSON-RPC request and response (the 2-second card poll). */
  async send(parts: Part[], metadata: Record<string, unknown>): Promise<Message | Task> {
    const client = await this.connect();
    return (await client.sendMessage(this.request(parts, metadata))) as Message | Task;
  }

  /** A streaming request: the response arrives as SSE events (chat text and button actions). */
  async *stream(parts: Part[], metadata: Record<string, unknown>): AsyncGenerator<StreamResponse> {
    const client = await this.connect();
    yield* client.sendMessageStream(this.request(parts, metadata)) as AsyncGenerator<StreamResponse>;
  }
}
