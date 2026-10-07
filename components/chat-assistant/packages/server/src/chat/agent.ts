/**
 * Chat text goes to a Mastra agent. It can read incidents and ask
 * diagnosis-agent; it cannot change anything. Button actions never come here
 * (see ../actions.ts).
 *
 * The model is reached through MODEL_BASE_URL (the gateway's model route; an
 * Anthropic Messages API) with the caller's bearer token, so the gateway
 * attributes and authorizes the model call per user. No provider key exists
 * in this process.
 *
 * Request parameters are left at their defaults on purpose: the current
 * Sonnet rejects non-default sampling values, a forced tool choice and
 * disabled thinking, so none of them is set.
 */
import { createAnthropic } from '@ai-sdk/anthropic';
import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import type { Identity } from '../auth.js';
import type { Config } from '../config.js';
import { getIncident, listIncidents } from '../downstream/index.js';
import { Refusal, type Downstreams } from '../downstream/types.js';

type ChatRequestContext = { identity: Identity };

const HISTORY_TURNS = 12;
const MAX_CONTEXTS = 200;

function instructions(identity: Identity): string {
  return [
    'You are the chat assistant in an incident-response demo. You answer questions about the current incident for the signed-in user.',
    `Signed-in user: ${identity.user}. Roles: ${identity.roles.join(', ') || 'none'}. Team: ${identity.team ?? 'none'}.`,
    'You can read incidents with list_incidents and get_incident, and you can ask the diagnosis agent a question with ask_diagnosis_agent. Read the incident record first. Ask the diagnosis agent when the record does not answer the question (for example no diagnosis is recorded yet) or when the user asks for a fresh look: it investigates the running system, which takes 10 to 15 seconds.',
    'You cannot change anything: proposing, approving, rejecting or applying a change, restarting a workload and posting a status update happen only through the buttons on the incident card. Those buttons act as the signed-in user and are checked by the gateway and by the delivery service. If the user asks for one of these, say which button does it and which role has it (developer proposes, incident-manager approves or rejects and drafts the status update, platform-engineer applies or restarts). Never say an action was taken.',
    'If a tool result says it was refused, tell the user who refused it (the gateway or the service) and why, in their words.',
    'Answer in a few plain sentences. No Markdown, no headings, no lists unless the user asks for one.',
  ].join('\n\n');
}

/** A tool result the model can read: data, or a refusal or failure stated in words. */
async function forModel(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof Refusal) return { refused: true, by: err.layer, rule: err.rule, message: err.message };
    return { failed: true, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * One attempt per model call. A 5xx, a 429 or a refused connection is marked
 * retryable by the provider, and is then tried twice more, 2 and 4 seconds
 * apart, before the failure is reported. `maxRetries: 0` on the agent or on the
 * call does not reach that retry (checked with @mastra/core 1.74.0), so the
 * provider's error is marked final here instead. A user who is told at once
 * that the model is down can ask again; the card does not need the model.
 */
function oneAttempt<M extends object>(model: M): M {
  const final = (err: unknown): never => {
    if (err && typeof err === 'object' && 'isRetryable' in err) (err as { isRetryable: boolean }).isRetryable = false;
    throw err;
  };
  return new Proxy(model, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if ((prop === 'doStream' || prop === 'doGenerate') && typeof value === 'function') {
        return (...args: unknown[]) => Promise.resolve(value.apply(target, args)).catch(final);
      }
      return value;
    },
  });
}

export interface Chat {
  /** Streams the reply's text through `onDelta` and resolves with the whole text. */
  reply(input: {
    identity: Identity;
    contextId: string;
    text: string;
    onDelta: (delta: string) => void;
    signal?: AbortSignal;
  }): Promise<string>;
}

export function createChat(config: Config, downstreams: Downstreams): Chat {
  const token = (rc: RequestContext<ChatRequestContext>) => rc.get('identity').token;

  const agent = new Agent<'chat-assistant', Record<string, ReturnType<typeof createTool>>, undefined, ChatRequestContext>({
    id: 'chat-assistant',
    name: 'chat-assistant',
    instructions: ({ requestContext }) => instructions(requestContext.get('identity')),
    model: ({ requestContext }) =>
      oneAttempt(
        createAnthropic({
          baseURL: `${config.model.baseUrl}/v1`,
          // Sent as `Authorization: Bearer <caller's token>`.
          authToken: token(requestContext),
        })(config.model.id),
      ),
    tools: {
      list_incidents: createTool({
        id: 'list_incidents',
        description: 'List the incidents the signed-in user can see, with their status.',
        inputSchema: z.object({}),
        execute: async (_input, { requestContext }) =>
          forModel(() => listIncidents(downstreams, token(requestContext as RequestContext<ChatRequestContext>))),
      }),
      get_incident: createTool({
        id: 'get_incident',
        description:
          'Read one incident: service, severity, impact, suspected cause, evidence, the proposed change and its status, and the timeline.',
        inputSchema: z.object({ incident_id: z.string().describe('The incident identifier, for example INC-1') }),
        execute: async ({ incident_id }, { requestContext }) =>
          forModel(() => getIncident(downstreams, token(requestContext as RequestContext<ChatRequestContext>), incident_id)),
      }),
      ask_diagnosis_agent: createTool({
        id: 'ask_diagnosis_agent',
        description:
          'Ask the diagnosis agent to investigate (read-only). Name the service and the symptom or alert in the question. Returns a suspected cause, evidence and a recommended version.',
        inputSchema: z.object({ question: z.string().describe('The question, naming the service and the alert or symptom') }),
        execute: async ({ question }, { requestContext }) =>
          forModel(() => downstreams.diagnosis.diagnose(token(requestContext as RequestContext<ChatRequestContext>), question)),
      }),
    },
  });

  type Turn = { role: 'user'; content: string } | { role: 'assistant'; content: string };
  const histories = new Map<string, Turn[]>();

  return {
    async reply({ identity, contextId, text, onDelta, signal }) {
      // A conversation belongs to one user: the key includes who is asking.
      const key = `${identity.user}\n${contextId}`;
      const history = histories.get(key) ?? [];
      histories.delete(key);
      if (histories.size >= MAX_CONTEXTS) histories.delete(histories.keys().next().value!);

      const requestContext = new RequestContext<ChatRequestContext>();
      requestContext.set('identity', identity);

      const turn: Turn = { role: 'user', content: text };
      const stream = await agent.stream([...history, turn], {
        requestContext,
        maxSteps: 6,
        abortSignal: signal,
      });

      let reply = '';
      for await (const chunk of stream.fullStream) {
        if (chunk.type === 'text-delta') {
          const delta = (chunk.payload as { text?: string }).text ?? '';
          if (delta) {
            reply += delta;
            onDelta(delta);
          }
        } else if (chunk.type === 'error') {
          throw (chunk.payload as { error: unknown }).error;
        }
      }

      histories.set(key, [...history, turn, { role: 'assistant' as const, content: reply }].slice(-2 * HISTORY_TURNS));
      return reply;
    },
  };
}
