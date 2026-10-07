/**
 * The HTTP surface, in one process:
 *
 *   GET  /healthz                         liveness (no auth)
 *   GET  /.well-known/agent-card.json     A2A agent card (no auth; also under /a2a/)
 *   POST /        and  POST /a2a          A2A JSON-RPC, SSE for streaming (bearer JWT)
 *   POST /hooks/alert                     Alertmanager webhook (bearer JWT, role alert-automation)
 *   GET  /config.json                     runtime configuration for the UI (no auth)
 *   GET  /*                               the built UI, if present
 *
 * The A2A endpoint is served with the A2A JavaScript SDK rather than Mastra's
 * built-in A2A route, which cannot carry the A2UI extension (see
 * scripts/spike-mastra-a2a.ts). Mastra remains the agent framework: the
 * executor calls the Mastra agent for chat text.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AgentCard, Extensions } from '@a2a-js/sdk';
import {
  DefaultRequestHandler,
  InMemoryTaskStore,
  defaultServerCallContextBuilder,
  type ServerCallContextBuilder,
} from '@a2a-js/sdk/server';
import { agentCardHandler, jsonRpcHandler } from '@a2a-js/sdk/server/express';
import express, { type Express, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { buildAgentCard } from './a2a/card.js';
import { CallerUser, ChatAssistantExecutor } from './a2a/executor.js';
import { requireAuth, type TokenVerifier } from './auth.js';
import type { Chat } from './chat/agent.js';
import type { Config } from './config.js';
import type { TestIssuer } from './dev/test-issuer.js';
import { DiagnosisTracker } from './diagnosis-status.js';
import type { Downstreams } from './downstream/types.js';
import { alertHook } from './hooks/alert.js';

export interface AppDeps {
  config: Config;
  verify: TokenVerifier;
  downstreams: Downstreams;
  chat: Chat;
  testIssuer?: TestIssuer;
  /** How often a running action pushes the card (default 1 s). */
  progressIntervalMs?: number;
}

/** Request headers a browser A2A client sends; a gateway in front must allow the same. */
export const CORS_ALLOW_HEADERS = [
  'Authorization',
  'Content-Type',
  'Accept',
  'A2A-Version',
  'A2A-Extensions',
  'X-A2A-Extensions',
  'traceparent',
  'tracestate',
];

/** The A2UI specification names `X-A2A-Extensions`; A2A 1.0 names `A2A-Extensions`. Both are honored. */
const contextBuilder: ServerCallContextBuilder = (options) => {
  const legacy = options.headers['x-a2a-extensions'];
  const fromLegacy = Extensions.parseServiceParameter(Array.isArray(legacy) ? legacy.join(',') : legacy);
  return defaultServerCallContextBuilder({
    ...options,
    extensions: [...new Set([...(options.extensions ?? []), ...fromLegacy])],
  });
};

export function createApp(deps: AppDeps): Express {
  const { config } = deps;
  const app = express();
  app.disable('x-powered-by');

  // CORS, only for configured origins. Bearer tokens travel in a header, so no credentials mode.
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && (config.corsAllowedOrigins.includes(origin) || config.corsAllowedOrigins.includes('*'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Expose-Headers', 'A2A-Extensions, X-A2A-Extensions, WWW-Authenticate');
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS.join(', '));
        res.setHeader('Access-Control-Max-Age', '600');
        res.status(204).end();
        return;
      }
    }
    next();
  });

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok', service: 'chat-assistant', version: config.appVersion, stub: config.stubDownstreams });
  });

  app.get('/config.json', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      oidcIssuer: config.ui.oidcIssuer,
      oidcClientId: config.ui.oidcClientId,
      oidcScope: config.ui.oidcScope,
      a2aUrl: config.ui.a2aUrl,
      a2aProtocolVersion: config.ui.a2aProtocolVersion,
      pollIntervalMs: config.ui.pollIntervalMs,
      appVersion: config.appVersion,
    });
  });

  if (deps.testIssuer) app.use('/dev/issuer', deps.testIssuer.router);

  // --- A2A ---
  const publicUrl = config.publicUrl || `http://localhost:${config.port}`;
  const legacyCompat = { enabled: true };
  const agentCard = buildAgentCard(config, publicUrl);
  // What the alert hook knows about a diagnosis that is not in the incident record yet; the card shows it.
  const tracker = new DiagnosisTracker();
  const requestHandler = new DefaultRequestHandler(
    agentCard,
    new InMemoryTaskStore(),
    new ChatAssistantExecutor(deps.downstreams, deps.chat, deps.progressIntervalMs, config.model.timeoutMs, tracker),
  );
  // The SDK's handler serves the 0.3-shaped card (no A2A-Version header). For
  // 1.0 it would print its in-memory form, where `securitySchemes` is not in
  // wire shape, so the 1.0 card is written here with the SDK's own codec.
  const cardV1: RequestHandler = (req, res, next) => {
    if (req.method !== 'GET' || req.path !== '/' || req.header('A2A-Version') !== '1.0') return next();
    res.setHeader('Vary', 'A2A-Version');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.json(AgentCard.toJSON(agentCard));
  };
  const cardLegacy = agentCardHandler({ agentCardProvider: requestHandler, legacyCompat, cache: { maxAge: 300 } });
  // The SDK's 0.3 card carries both the 0.3 `url` and the 1.0 `supportedInterfaces`. A gateway
  // that rewrites card addresses rewrites the interfaces when it finds them and leaves `url`
  // alone, so a 0.3 client would read the in-cluster address. A 0.3 card has no use for the 1.0
  // field: without it the gateway rewrites `url`, as it does for the other agents.
  const cardLegacyUrlOnly: RequestHandler = (_req, res, next) => {
    const send = res.send.bind(res);
    res.send = (body?: unknown) => {
      if (typeof body === 'string' && body.startsWith('{')) {
        try {
          const card = JSON.parse(body) as { url?: unknown; supportedInterfaces?: unknown };
          if (typeof card.url === 'string' && card.supportedInterfaces) {
            delete card.supportedInterfaces;
            return send(JSON.stringify(card));
          }
        } catch {
          /* not a card: pass it on untouched */
        }
      }
      return send(body);
    };
    next();
  };
  for (const cardPath of ['/.well-known/agent-card.json', '/a2a/.well-known/agent-card.json']) {
    app.use(cardPath, cardV1, cardLegacyUrlOnly, cardLegacy);
  }

  const auth = requireAuth(deps.verify);
  const rpc = jsonRpcHandler({
    requestHandler,
    userBuilder: async (req) => new CallerUser(req.identity!),
    legacyCompat,
    contextBuilder,
  });
  app.post('/', auth, rpc);
  app.post('/a2a', auth, (req, res, next) => {
    req.url = '/';
    rpc(req, res, next);
  });

  const hook = alertHook(deps.downstreams, tracker);
  app.locals.alertHook = hook;
  app.post('/hooks/alert', auth, express.json({ limit: '1mb' }), hook.handler);

  // --- UI ---
  const index = path.join(config.ui.distDir, 'index.html');
  if (fs.existsSync(index)) {
    app.use(express.static(config.ui.distDir, { index: false, maxAge: '1h' }));
    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith('/dev/') || path.extname(req.path)) return next();
      res.setHeader('Cache-Control', 'no-store');
      res.sendFile(index);
    });
  }

  return app;
}
