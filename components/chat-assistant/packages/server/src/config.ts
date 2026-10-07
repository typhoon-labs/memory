/**
 * Every binding comes from the environment (see docs/contracts.md).
 * Nothing here is a secret: the server holds no credentials of its own and only
 * ever forwards the caller's bearer token.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Config {
  host: string;
  port: number;
  appVersion: string;
  oidc: { issuer: string; jwksUrl: string; audience: string };
  /** `timeoutMs`: all the time one chat answer may take, tool calls included. There is no retry. */
  model: { baseUrl: string; id: string; timeoutMs: number };
  downstream: {
    deliveryMcpUrl: string;
    remediationAgentUrl: string;
    commsAgentUrl: string;
    diagnosisAgentUrl: string;
  };
  /** Use in-memory fakes for delivery-mcp and the three agents. */
  stubDownstreams: boolean;
  stub: { seed: boolean; phaseMs: number; diagnosisMs: number };
  /** How long the alert hook and the chat tool wait for one diagnosis. */
  diagnosisTimeoutMs: number;
  /** Local testing only: an issuer whose key is generated when the process starts. */
  devTestIssuer: boolean;
  /** Origins allowed to call the A2A endpoint from a browser. Empty: send no CORS headers. */
  corsAllowedOrigins: string[];
  /** URL clients use to reach the A2A endpoint (the gateway route). Empty: derived per request. */
  publicUrl: string;
  ui: {
    distDir: string;
    oidcIssuer: string;
    oidcClientId: string;
    oidcScope: string;
    a2aUrl: string;
    a2aProtocolVersion: string;
    pollIntervalMs: number;
  };
}

function flag(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true';
}

function list(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

const here = path.dirname(fileURLToPath(import.meta.url));

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 8080);
  const devTestIssuer = flag(env.DEV_TEST_ISSUER);
  const selfUrl = `http://localhost:${port}`;

  const issuer = devTestIssuer ? `${selfUrl}/dev/issuer` : (env.OIDC_ISSUER ?? '');
  const oidc = {
    issuer,
    jwksUrl: devTestIssuer ? `${selfUrl}/dev/issuer/jwks` : (env.OIDC_JWKS_URL ?? ''),
    audience: env.OIDC_AUDIENCE ?? 'agentgateway',
  };
  if (!oidc.issuer || !oidc.jwksUrl) {
    throw new Error('OIDC_ISSUER and OIDC_JWKS_URL are required (or set DEV_TEST_ISSUER=1 for local testing).');
  }

  const stubDownstreams = flag(env.STUB_DOWNSTREAMS);
  const downstream = {
    deliveryMcpUrl: env.DELIVERY_MCP_URL ?? '',
    remediationAgentUrl: env.REMEDIATION_AGENT_URL ?? '',
    commsAgentUrl: env.COMMS_AGENT_URL ?? '',
    diagnosisAgentUrl: env.DIAGNOSIS_AGENT_URL ?? '',
  };
  if (!stubDownstreams && !downstream.deliveryMcpUrl) {
    throw new Error('DELIVERY_MCP_URL is required unless STUB_DOWNSTREAMS=1.');
  }

  return {
    host: env.HOST ?? '0.0.0.0',
    port,
    appVersion: env.APP_VERSION ?? '0.0.0-dev',
    oidc,
    model: {
      baseUrl: (env.MODEL_BASE_URL ?? 'http://localhost:7070').replace(/\/+$/, ''),
      id: env.MODEL_ID ?? 'claude-sonnet-5-5',
      timeoutMs: Number(env.MODEL_TIMEOUT_SECONDS ?? 60) * 1000,
    },
    downstream,
    stubDownstreams,
    stub: {
      seed: env.STUB_SEED === undefined ? true : flag(env.STUB_SEED),
      phaseMs: Number(env.STUB_PHASE_MS ?? 2500),
      diagnosisMs: Number(env.STUB_DIAGNOSIS_MS ?? 3000),
    },
    diagnosisTimeoutMs: Number(env.DIAGNOSIS_TIMEOUT_SECONDS ?? 60) * 1000,
    devTestIssuer,
    corsAllowedOrigins: list(env.CORS_ALLOWED_ORIGINS),
    publicUrl: (env.A2A_PUBLIC_URL ?? '').replace(/\/+$/, ''),
    ui: {
      distDir: env.UI_DIST_DIR ?? path.resolve(here, '../../ui/dist'),
      oidcIssuer: env.UI_OIDC_ISSUER ?? issuer,
      oidcClientId: env.UI_OIDC_CLIENT_ID ?? 'chat-ui',
      oidcScope: env.UI_OIDC_SCOPE ?? 'openid profile',
      a2aUrl: (env.UI_A2A_URL ?? '').replace(/\/+$/, ''),
      a2aProtocolVersion: env.UI_A2A_PROTOCOL_VERSION ?? '1.0',
      pollIntervalMs: Number(env.UI_POLL_INTERVAL_MS ?? 2000),
    },
  };
}
