/**
 * A small A2A + A2UI client for scripts and tests (Node). It does what the
 * browser UI does, without rendering:
 *
 *   - talks A2A JSON-RPC (1.0 or 0.3) with the official SDK client;
 *   - keeps each surface's components and data model, applying
 *     createSurface / updateComponents / updateDataModel / deleteSurface;
 *   - reports its data model back on every request (A2UI Data Model Sync);
 *   - turns a button into the A2UI `action` a click would send.
 */
import type { Message, Part, StreamResponse, Task } from '@a2a-js/sdk';
import { ClientFactory, DefaultAgentCardResolver, JsonRpcTransportFactory, type Client } from '@a2a-js/sdk/client';
import {
  A2UI_EXTENSION_URI,
  A2UI_VERSION,
  BASIC_CATALOG_ID,
  SYNC_MIME_TYPE,
  a2uiMessagesOf,
  a2uiPart,
  dataPart,
  isA2uiPart,
  isTask,
  textOf,
  textPart,
  userMessage,
} from '../../src/a2a/wire.js';

type Json = Record<string, any>;
interface Surface {
  components: Map<string, Json>;
  model: Json;
}

const legacyCompat = { enabled: true };

function setPath(model: Json, path: string, value: unknown): Json {
  if (!path || path === '/') return (value ?? {}) as Json;
  const keys = path.split('/').filter(Boolean);
  let node = model;
  for (const key of keys.slice(0, -1)) node = node[key] ??= {};
  if (value === undefined) delete node[keys.at(-1)!];
  else node[keys.at(-1)!] = value;
  return model;
}

function getPath(model: Json, path: string): unknown {
  return path
    .split('/')
    .filter(Boolean)
    .reduce<any>((node, key) => node?.[key], model);
}

export interface Reply {
  /** Final task state name (COMPLETED, REJECTED, FAILED) or MESSAGE for a plain message reply. */
  state: string;
  text: string;
  metadata: Json;
  /** Every A2UI message received, in order. */
  a2ui: Json[];
  /** Kinds of stream events seen, in order. */
  events: string[];
  parts: Part[];
}

export class A2aSession {
  readonly surfaces = new Map<string, Surface>();
  private readonly contextId = crypto.randomUUID();

  private constructor(
    readonly client: Client,
    readonly card: Json,
    readonly lastResponseHeaders: { value?: Headers },
  ) {}

  static async connect(baseUrl: string, token: string, protocolVersion: '1.0' | '0.3' = '1.0'): Promise<A2aSession> {
    const lastResponseHeaders: { value?: Headers } = {};
    const fetchImpl: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);
      // The A2UI specification's header name, and A2A 1.0's.
      headers.set('X-A2A-Extensions', A2UI_EXTENSION_URI);
      headers.set('A2A-Extensions', A2UI_EXTENSION_URI);
      const res = await fetch(input, { ...init, headers });
      lastResponseHeaders.value = res.headers;
      if (res.status === 401 || res.status === 403) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      return res;
    };
    // The resolver joins the card path onto the base as a relative URL, so a base with a path
    // (a gateway route such as /a2a/chat-assistant) must end in a slash or its last segment is lost.
    const card = await new DefaultAgentCardResolver({ fetchImpl, legacyCompat }).resolve(`${baseUrl.replace(/\/+$/, '')}/`);
    const interfaces = card.supportedInterfaces
      .filter((i) => i.protocolBinding === 'JSONRPC' && i.protocolVersion === protocolVersion)
      .map((i) => ({ ...i, url: baseUrl }));
    if (!interfaces.length) throw new Error(`the agent card offers no JSON-RPC interface for A2A ${protocolVersion}`);
    const factory = new ClientFactory({ transports: [new JsonRpcTransportFactory({ fetchImpl, legacyCompat })] });
    const client = await factory.createFromAgentCard({ ...card, supportedInterfaces: interfaces });
    return new A2aSession(client, card as unknown as Json, lastResponseHeaders);
  }

  private metadata(): Json {
    const surfaces = Object.fromEntries([...this.surfaces].map(([id, s]) => [id, s.model]));
    return {
      a2uiClientCapabilities: { [A2UI_VERSION]: { supportedCatalogIds: [BASIC_CATALOG_ID] } },
      ...(this.surfaces.size ? { a2uiClientDataModel: { version: A2UI_VERSION, surfaces } } : {}),
    };
  }

  private applyA2ui(messages: Json[]) {
    for (const m of messages) {
      if (m.createSurface) this.surfaces.set(m.createSurface.surfaceId, { components: new Map(), model: {} });
      if (m.deleteSurface) this.surfaces.delete(m.deleteSurface.surfaceId);
      if (m.updateComponents) {
        const surface = this.surfaces.get(m.updateComponents.surfaceId);
        if (!surface) throw new Error(`updateComponents for unknown surface ${m.updateComponents.surfaceId}`);
        // updateComponents adds or updates by id; it never removes.
        for (const c of m.updateComponents.components as Json[]) surface.components.set(c.id, c);
      }
      if (m.updateDataModel) {
        const surface = this.surfaces.get(m.updateDataModel.surfaceId);
        if (!surface) throw new Error(`updateDataModel for unknown surface ${m.updateDataModel.surfaceId}`);
        surface.model = setPath(surface.model, m.updateDataModel.path ?? '/', structuredClone(m.updateDataModel.value));
      }
    }
  }

  private collect(reply: Reply, parts: Part[] | undefined) {
    for (const part of parts ?? []) {
      reply.parts.push(part);
      if (isA2uiPart(part)) {
        const messages = a2uiMessagesOf(part);
        reply.a2ui.push(...messages);
        this.applyA2ui(messages);
      }
    }
    const text = textOf(parts);
    if (text) reply.text += text;
  }

  private newReply(): Reply {
    return { state: '', text: '', metadata: {}, a2ui: [], events: [], parts: [] };
  }

  private request(parts: Part[]) {
    return {
      tenant: '',
      message: userMessage(parts, this.metadata(), this.contextId),
      configuration: undefined,
      metadata: undefined,
    };
  }

  /** What the UI sends on load and every 2 seconds: "bring my card up to date". */
  async sync(): Promise<Reply> {
    const reply = this.newReply();
    const result = (await this.client.sendMessage(this.request([dataPart({ request: 'sync' }, SYNC_MIME_TYPE)]))) as Message | Task;
    this.absorb(reply, result);
    return reply;
  }

  private absorb(reply: Reply, result: Message | Task) {
    if (isTask(result)) {
      reply.state = taskStateName(result.status?.state);
      reply.metadata = result.status?.message?.metadata ?? {};
      this.collect(reply, result.status?.message?.parts);
      for (const artifact of result.artifacts) this.collect(reply, artifact.parts);
    } else {
      reply.state = 'MESSAGE';
      reply.metadata = result.metadata ?? {};
      this.collect(reply, result.parts);
    }
  }

  /** Sends parts over the streaming method (SSE) and folds the events into one reply. */
  private async stream(parts: Part[]): Promise<Reply> {
    const reply = this.newReply();
    for await (const event of this.client.sendMessageStream(this.request(parts)) as AsyncGenerator<StreamResponse>) {
      const payload = event.payload;
      if (!payload) continue;
      reply.events.push(payload.$case);
      if (payload.$case === 'message') this.absorb(reply, payload.value);
      else if (payload.$case === 'task') reply.state = taskStateName(payload.value.status?.state);
      else if (payload.$case === 'artifactUpdate') this.collect(reply, payload.value.artifact?.parts);
      else if (payload.$case === 'statusUpdate') {
        reply.state = taskStateName(payload.value.status?.state);
        reply.metadata = { ...reply.metadata, ...(payload.value.status?.message?.metadata ?? {}) };
        this.collect(reply, payload.value.status?.message?.parts);
      }
    }
    return reply;
  }

  chat(text: string): Promise<Reply> {
    return this.stream([textPart(text)]);
  }

  /** Sends an A2UI action with an explicit context (as a script would, bypassing the card). */
  action(name: string, context: Json, surfaceId = [...this.surfaces.keys()][0] ?? '', sourceComponentId = 'script'): Promise<Reply> {
    return this.stream([
      a2uiPart([{ version: A2UI_VERSION, action: { name, surfaceId, sourceComponentId, timestamp: new Date().toISOString(), context } }]),
    ]);
  }

  /** Clicks a button on the card: resolves its context against the data model, like the renderer does. */
  click(componentId: string, surfaceId = [...this.surfaces.keys()][0] ?? ''): Promise<Reply> {
    const surface = this.surfaces.get(surfaceId);
    const component = surface?.components.get(componentId);
    const event = component?.action?.event;
    if (!surface || !event) throw new Error(`no button "${componentId}" with a server action on surface "${surfaceId}"`);
    const disabled = this.buttons(surfaceId).find((b) => b.id === componentId)?.disabledBecause;
    if (disabled) throw new Error(`button "${componentId}" is disabled: ${disabled}`);
    const context = Object.fromEntries(
      Object.entries(event.context ?? {}).map(([key, value]) => [
        key,
        value && typeof value === 'object' && 'path' in (value as Json) ? getPath(surface.model, (value as Json).path) : value,
      ]),
    );
    return this.action(event.name, context, surfaceId, componentId);
  }

  /** Types into a text field (writes its bound data model path). */
  type(componentId: string, value: string, surfaceId = [...this.surfaces.keys()][0] ?? '') {
    const surface = this.surfaces.get(surfaceId);
    const path = surface?.components.get(componentId)?.value?.path;
    if (!surface || !path) throw new Error(`no text field "${componentId}" on surface "${surfaceId}"`);
    surface.model = setPath(surface.model, path, value);
  }

  /** The buttons on a surface, with whether a failing check disables them. */
  buttons(surfaceId = [...this.surfaces.keys()][0] ?? ''): { id: string; label: string; action: string; disabledBecause?: string }[] {
    const surface = this.surfaces.get(surfaceId);
    if (!surface) return [];
    const passes = (condition: unknown): boolean => {
      if (typeof condition === 'boolean') return condition;
      const c = condition as Json;
      if (c?.path) return Boolean(getPath(surface.model, c.path));
      if (c?.call === 'required') {
        const v = c.args?.value?.path ? getPath(surface.model, c.args.value.path) : c.args?.value;
        return v !== undefined && v !== null && String(v).trim() !== '';
      }
      return true;
    };
    return [...surface.components.values()]
      .filter((c) => c.component === 'Button' && c.action?.event)
      .map((c) => ({
        id: c.id,
        label: String(surface.components.get(c.child)?.text ?? ''),
        action: c.action.event.name,
        disabledBecause: (c.checks ?? []).find((check: Json) => !passes(check.condition))?.message,
      }));
  }

  /** A component as received. */
  component(componentId: string, surfaceId = [...this.surfaces.keys()][0] ?? ''): Json | undefined {
    return this.surfaces.get(surfaceId)?.components.get(componentId);
  }

  /** The surface's data model, as this client holds it. */
  model(surfaceId = [...this.surfaces.keys()][0] ?? ''): Json {
    return this.surfaces.get(surfaceId)?.model ?? {};
  }

  /** The text of a component, resolving a data binding. */
  text(componentId: string, surfaceId = [...this.surfaces.keys()][0] ?? ''): string {
    const surface = this.surfaces.get(surfaceId);
    const value = surface?.components.get(componentId)?.text;
    if (value && typeof value === 'object' && 'path' in value) return String(getPath(surface!.model, value.path) ?? '');
    return String(value ?? '');
  }
}

function taskStateName(state: unknown): string {
  const names: Record<number, string> = {
    1: 'SUBMITTED',
    2: 'WORKING',
    3: 'COMPLETED',
    4: 'FAILED',
    5: 'CANCELED',
    6: 'INPUT_REQUIRED',
    7: 'REJECTED',
    8: 'AUTH_REQUIRED',
  };
  return typeof state === 'number' ? (names[state] ?? String(state)) : String(state ?? '');
}
