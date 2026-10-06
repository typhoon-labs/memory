/**
 * The other agents, called over A2A JSON-RPC as the signed-in caller.
 *
 * - Requests always go to the configured `*_URL` (the gateway route), never to
 *   whatever URL an agent card advertises, so a card cannot route a call
 *   around the gateway.
 * - Both A2A 1.0 and 0.3 peers are supported (the Strands agents use 0.3).
 */
import { TaskState, type AgentCard } from '@a2a-js/sdk';
import { ClientFactory, DefaultAgentCardResolver, JsonRpcTransportFactory } from '@a2a-js/sdk/client';
import { dataOf, isTask, replyParts, textOf, textPart, userMessage } from '../a2a/wire.js';
import { findRefusal, normalizeDiagnosis } from './normalize.js';
import {
  DownstreamError,
  Refusal,
  type AgentReply,
  type CommsAgent,
  type DiagnosisAgent,
  type RemediationAgent,
} from './types.js';

const CARD_TTL_MS = 5 * 60_000;
const legacyCompat = { enabled: true };

export class A2aJsonRpcAgent {
  private card?: { value: AgentCard; at: number };

  constructor(
    private readonly name: string,
    private readonly url: string,
    private readonly timeoutMs = 180_000,
  ) {}

  /** Fetch that carries the caller's token and turns a gateway 401/403 into a Refusal. */
  private fetchAs(token: string): typeof fetch {
    return async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('Authorization', `Bearer ${token}`);
      const res = await fetch(input, { ...init, headers });
      if (res.status === 401 || res.status === 403) {
        const body = (await res.text().catch(() => '')).slice(0, 300);
        throw new Refusal({ layer: 'gateway', status: res.status, detail: body || `${this.name} is not available to you` });
      }
      return res;
    };
  }

  private async agentCard(fetchImpl: typeof fetch): Promise<AgentCard> {
    if (this.card && Date.now() - this.card.at < CARD_TTL_MS) return this.card.value;
    let card: AgentCard;
    try {
      // The resolver joins the card path onto the base as a relative URL, so a base with a path
      // (a gateway route such as /a2a/remediation-agent) must end in a slash or its last segment is lost.
      card = await new DefaultAgentCardResolver({ fetchImpl, legacyCompat }).resolve(`${this.url.replace(/\/+$/, '')}/`);
    } catch (err) {
      if (err instanceof Refusal) throw err;
      // No card reachable at this route: assume a plain 0.3 JSON-RPC agent.
      card = {
        name: this.name,
        description: '',
        supportedInterfaces: [],
        provider: undefined,
        version: '',
        capabilities: { streaming: false, pushNotifications: false, extensions: [] },
        securitySchemes: {},
        securityRequirements: [],
        defaultInputModes: ['text/plain'],
        defaultOutputModes: ['text/plain'],
        skills: [],
        signatures: [],
      };
    }
    const jsonRpc = card.supportedInterfaces.filter((i) => i.protocolBinding === 'JSONRPC');
    const pinned = (jsonRpc.length ? jsonRpc : [{ protocolBinding: 'JSONRPC', protocolVersion: '0.3', tenant: '', url: '' }]).map(
      (i) => ({ ...i, url: this.url }),
    );
    card = { ...card, supportedInterfaces: pinned };
    this.card = { value: card, at: Date.now() };
    return card;
  }

  /**
   * kagent can turn a message away for a moment with JSON-RPC -32004 ("input was not accepted;
   * retry after the session becomes available"). That asks for a retry, so it gets up to two.
   */
  async send(token: string, text: string): Promise<AgentReply> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.sendOnce(token, text);
      } catch (err) {
        if (attempt >= 3 || !(err instanceof DownstreamError) || !err.retryable) throw err;
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  private async sendOnce(token: string, text: string): Promise<AgentReply> {
    const fetchImpl = this.fetchAs(token);
    try {
      const card = await this.agentCard(fetchImpl);
      const factory = new ClientFactory({ transports: [new JsonRpcTransportFactory({ fetchImpl, legacyCompat })] });
      const client = await factory.createFromAgentCard(card);
      const result = await client.sendMessage(
        { tenant: '', message: userMessage([textPart(text)]), configuration: undefined, metadata: undefined },
        { signal: AbortSignal.timeout(this.timeoutMs) },
      );
      // An agent may repeat its answer in the final status message and in an artifact: read each once.
      const parts = replyParts(result);
      const statusText = isTask(result) ? textOf(result.status?.message?.parts) : '';
      const data = [...new Map(dataOf(parts).map((d) => [JSON.stringify(d), d])).values()];
      const reply: AgentReply = {
        text: statusText || textOf(isTask(result) ? result.artifacts.flatMap((a) => a.parts) : parts),
        data,
        failed: isTask(result) && result.status?.state !== TaskState.TASK_STATE_COMPLETED,
      };
      // An agent that calls a tool as the caller relays that tool's refusal.
      const refusal = findRefusal(reply.data) ?? findRefusal(reply.text);
      if (refusal) throw refusal;
      return reply;
    } catch (err) {
      if (err instanceof Refusal) throw err;
      const cause = err instanceof Error ? (err.cause ?? err) : err;
      if (cause instanceof Refusal) throw cause;
      this.card = undefined;
      const e = err as { name?: string; reason?: string; code?: number; message?: string };
      const busy = e?.name === 'UnsupportedOperationError' || e?.reason === 'UNSUPPORTED_OPERATION' || e?.code === -32004;
      const timedOut = e?.name === 'TimeoutError' || e?.name === 'AbortError';
      throw new DownstreamError(
        this.name,
        timedOut ? `no answer within ${Math.round(this.timeoutMs / 1000)} seconds` : err instanceof Error ? err.message : String(err),
        busy,
      );
    }
  }
}

/**
 * The Strands agents answer with words and a data part
 * `{action, outcome, refusal, ...}`. A `refusal` object from delivery-mcp is
 * recognised in `send`. `outcome: "rejected"` means the agent's own tool call
 * was turned away before it reached the service, which is the gateway's doing.
 * Any other outcome than `expected` is a failure, reported in the agent's words.
 */
function settle(agent: string, reply: AgentReply, expected: string): AgentReply {
  const result = reply.data.find((d): d is { outcome: string } => typeof (d as { outcome?: unknown })?.outcome === 'string');
  if (result?.outcome === 'rejected') throw new Refusal({ layer: 'gateway', detail: reply.text || `${agent} could not call its tool as you` });
  if (reply.failed || (result && result.outcome !== expected)) {
    throw new DownstreamError(agent, reply.text || `ended with outcome ${result?.outcome ?? 'unknown'}`);
  }
  return reply;
}

export function createRemediationAgent(url: string): RemediationAgent {
  const agent = new A2aJsonRpcAgent('remediation-agent', url);
  return {
    applyAndVerify: async (token, changeId) =>
      settle('remediation-agent', await agent.send(token, JSON.stringify({ action: 'apply_and_verify', change_id: changeId })), 'applied'),
  };
}

export function createCommsAgent(url: string): CommsAgent {
  const agent = new A2aJsonRpcAgent('comms-agent', url);
  return {
    draftStatusUpdate: async (token, incidentId) =>
      settle('comms-agent', await agent.send(token, JSON.stringify({ action: 'draft_status_update', incident_id: incidentId })), 'drafted'),
  };
}

/** The JSON-RPC implementation of the diagnosis seam. A gRPC one would implement the same interface. */
export function createDiagnosisAgent(url: string, timeoutMs = 60_000): DiagnosisAgent {
  const agent = url ? new A2aJsonRpcAgent('diagnosis-agent', url, timeoutMs) : undefined;
  return {
    configured: !!agent,
    async diagnose(token, question) {
      if (!agent) throw new DownstreamError('diagnosis-agent', 'DIAGNOSIS_AGENT_URL is not set');
      const reply = await agent.send(token, question);
      return normalizeDiagnosis(reply.text, reply.data);
    },
  };
}
