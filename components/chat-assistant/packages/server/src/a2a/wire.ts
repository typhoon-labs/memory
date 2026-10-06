/**
 * Small helpers over the A2A SDK's message types, plus the constants of the
 * A2UI extension v0.9.1
 * (https://a2ui.org/specification/v0.9.1-a2ui-extension-specification/).
 */
import { Role, type Message, type Part, type Task } from '@a2a-js/sdk';

export const A2UI_EXTENSION_URI = 'https://a2ui.org/a2a-extension/a2ui/v0.9.1';
export const A2UI_MIME_TYPE = 'application/a2ui+json';
/** Older A2UI agents used this spelling; accepted on input only. */
export const A2UI_MIME_TYPE_DEPRECATED = 'application/json+a2ui';
export const A2UI_VERSION = 'v0.9.1';
export const BASIC_CATALOG_ID = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
/** Our own request for the current card, sent by the UI on load and on each poll. */
export const SYNC_MIME_TYPE = 'application/vnd.chat-assistant.sync+json';

export type A2uiMessage = { version: string } & Record<string, unknown>;

export interface A2uiAction {
  name: string;
  surfaceId: string;
  sourceComponentId: string;
  timestamp?: string;
  context: Record<string, unknown>;
}

export function textPart(text: string): Part {
  return { content: { $case: 'text', value: text }, metadata: undefined, filename: '', mediaType: '' };
}

export function dataPart(value: unknown, mimeType = 'application/json'): Part {
  return { content: { $case: 'data', value }, metadata: { mimeType }, filename: '', mediaType: mimeType };
}

/** A2UI messages travel as one data part whose `data` is the array of messages. */
export function a2uiPart(messages: A2uiMessage[]): Part {
  return dataPart(messages, A2UI_MIME_TYPE);
}

export function agentMessage(input: {
  contextId: string;
  taskId?: string;
  parts: Part[];
  metadata?: Record<string, unknown>;
}): Message {
  const carriesA2ui = input.parts.some((p) => p.metadata?.mimeType === A2UI_MIME_TYPE);
  return {
    messageId: crypto.randomUUID(),
    contextId: input.contextId,
    taskId: input.taskId ?? '',
    role: Role.ROLE_AGENT,
    parts: input.parts,
    metadata: input.metadata,
    extensions: carriesA2ui ? [A2UI_EXTENSION_URI] : [],
    referenceTaskIds: [],
  };
}

export function userMessage(parts: Part[], metadata?: Record<string, unknown>, contextId = ''): Message {
  return {
    messageId: crypto.randomUUID(),
    contextId,
    taskId: '',
    role: Role.ROLE_USER,
    parts,
    metadata,
    extensions: [],
    referenceTaskIds: [],
  };
}

export function partMimeType(part: Part): string {
  const fromMetadata = part.metadata?.mimeType;
  return typeof fromMetadata === 'string' && fromMetadata ? fromMetadata : part.mediaType;
}

export function isA2uiPart(part: Part): boolean {
  const mime = partMimeType(part);
  return part.content?.$case === 'data' && (mime === A2UI_MIME_TYPE || mime === A2UI_MIME_TYPE_DEPRECATED);
}

/**
 * The A2UI messages in a data part. The specification says `data` is an array;
 * the SDK's v0.3 translation wraps an array as `{value: [...]}` (v0.3 data must
 * be an object); and A2UI's own reference agent sends one message per part.
 * All three are read.
 */
export function a2uiMessagesOf(part: Part): Record<string, unknown>[] {
  if (part.content?.$case !== 'data') return [];
  const value = part.content.value as unknown;
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { value?: unknown }).value)
      ? (value as { value: unknown[] }).value
      : [value];
  return list.filter((m): m is Record<string, unknown> => m !== null && typeof m === 'object' && !Array.isArray(m));
}

export function textOf(parts: Part[] | undefined): string {
  return (parts ?? [])
    .map((p) => (p.content?.$case === 'text' ? p.content.value : ''))
    .filter(Boolean)
    .join('\n');
}

export function dataOf(parts: Part[] | undefined): unknown[] {
  return (parts ?? []).flatMap((p) => (p.content?.$case === 'data' ? [p.content.value as unknown] : []));
}

export function isTask(result: Message | Task): result is Task {
  return 'status' in result && !('parts' in result);
}

/** Every part an agent returned for one request: the message, or the task's final message and artifacts. */
export function replyParts(result: Message | Task): Part[] {
  if (!isTask(result)) return result.parts;
  return [...(result.status?.message?.parts ?? []), ...result.artifacts.flatMap((a) => a.parts)];
}
