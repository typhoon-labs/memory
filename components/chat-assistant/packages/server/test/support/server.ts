/**
 * Starts the real server in-process on a free port: stub downstreams, a test
 * issuer with a key generated for this run, and a fake model endpoint.
 */
import type { AddressInfo } from 'node:net';
import { createApp } from '../../src/app.js';
import { createTokenVerifier } from '../../src/auth.js';
import { createChat } from '../../src/chat/agent.js';
import { loadConfig } from '../../src/config.js';
import { createTestIssuer } from '../../src/dev/test-issuer.js';
import { createStubDownstreams } from '../../src/downstream/stub.js';
import type { Downstreams } from '../../src/downstream/types.js';
import { startFakeAnthropic, type FakeAnthropic } from './fake-anthropic.js';

export interface TestServer {
  url: string;
  model: FakeAnthropic;
  downstreams: Downstreams;
  /** Resolves when every diagnosis the alert hook started has ended. */
  alertsSettled(): Promise<void>;
  token(subject: string): Promise<string>;
  close(): Promise<void>;
}

export async function startTestServer(
  options: {
    seed?: boolean;
    phaseMs?: number;
    cors?: string;
    modelTimeoutSeconds?: number;
    /** How long the fake diagnosis takes, or what the diagnosis agent does instead of answering. */
    diagnosisMs?: number;
    diagnosis?: 'fails' | 'not-configured';
  } = {},
): Promise<TestServer> {
  const model = await startFakeAnthropic();
  const issuerUrl = 'http://test-issuer.invalid/realms/demo';
  const config = loadConfig({
    PORT: '0',
    OIDC_ISSUER: issuerUrl,
    OIDC_JWKS_URL: `${issuerUrl}/certs`,
    OIDC_AUDIENCE: 'agentgateway',
    STUB_DOWNSTREAMS: '1',
    MODEL_BASE_URL: model.url,
    MODEL_ID: 'claude-haiku-4-5-20251001',
    ...(options.modelTimeoutSeconds ? { MODEL_TIMEOUT_SECONDS: String(options.modelTimeoutSeconds) } : {}),
    APP_VERSION: 'test',
    CORS_ALLOWED_ORIGINS: options.cors ?? '',
    UI_DIST_DIR: '/nonexistent',
  });
  const issuer = await createTestIssuer({ issuer: issuerUrl, audience: 'agentgateway' });
  const downstreams = createStubDownstreams({
    seed: options.seed ?? false,
    phaseMs: options.phaseMs ?? 60,
    diagnosisMs: options.diagnosisMs ?? 0,
  });
  if (options.diagnosis === 'fails') {
    let calls = 0;
    const working = downstreams.diagnosis;
    downstreams.diagnosis = {
      configured: true,
      // Fails the first time and works after that, like an agent that was briefly unavailable.
      diagnose: async (token, question) => {
        if (++calls === 1) throw new Error('diagnosis-agent: no answer within 60 seconds');
        return working.diagnose(token, question);
      },
    };
  }
  if (options.diagnosis === 'not-configured') {
    downstreams.diagnosis = {
      configured: false,
      diagnose: async () => {
        throw new Error('diagnosis-agent: DIAGNOSIS_AGENT_URL is not set');
      },
    };
  }
  const app = createApp({
    config,
    verify: createTokenVerifier({ issuer: issuerUrl, audience: 'agentgateway', keys: issuer.keys }),
    downstreams,
    chat: createChat(config, downstreams),
    progressIntervalMs: 100,
  });
  const listener = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => listener.once('listening', resolve));
  return {
    url: `http://127.0.0.1:${(listener.address() as AddressInfo).port}`,
    model,
    downstreams,
    alertsSettled: () => app.locals.alertHook.settled(),
    token: (subject) => issuer.accessToken(subject),
    async close() {
      listener.closeAllConnections();
      await new Promise((resolve) => listener.close(resolve));
      await model.close();
    },
  };
}

/** An Alertmanager webhook body (version 4) with one firing alert. */
export function alertmanagerPayload(service = 'search-service') {
  return {
    version: '4',
    status: 'firing',
    receiver: 'chat-assistant',
    groupLabels: { alertname: 'SearchErrorRateHigh' },
    commonLabels: { alertname: 'SearchErrorRateHigh', service, severity: 'critical' },
    alerts: [
      {
        status: 'firing',
        labels: { alertname: 'SearchErrorRateHigh', service, severity: 'critical' },
        annotations: {
          summary: 'Search requests are failing',
          impact: '100% of searches failing; 412 failed in 5 minutes',
        },
        startsAt: '2026-10-06T09:14:00Z',
      },
    ],
  };
}
