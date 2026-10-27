/**
 * Every binding comes from the environment (see docs/contracts.md).
 * Nothing here is a secret. The server forwards the caller's bearer token or,
 * with delegation, exchanges it at chain-sts, proving itself with its pod's
 * service-account token, which the kubelet keeps in a file.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Config {
  host: string;
  port: number;
  appVersion: string;
  /**
   * `audience`: the gateway's, asked for at chain-sts for what goes downstream.
   * `acceptedAudiences`: what a caller's token may carry, one being enough
   * (OIDC_ACCEPTED_AUDIENCES, else `audience` alone).
   */
  oidc: { issuer: string; jwksUrl: string; audience: string; acceptedAudiences: string[] };
  /** `timeoutMs`: all the time one chat answer may take, tool calls included. There is no retry. */
  model: { baseUrl: string; id: string; timeoutMs: number };
  downstream: {
    deliveryMcpUrl: string;
    remediationAgentUrl: string;
    commsAgentUrl: string;
    diagnosisAgentUrl: string;
  };
  /**
   * chain-sts, where the caller's token is exchanged before every downstream
   * call (see downstream/delegation.ts). Unset: the caller's own token goes downstream.
   */
  delegation?: {
    /** RFC 8414 metadata; the exchange goes to its `token_endpoint` as given. */
    metadataUrl: string;
    /** This pod's projected service-account token for audience chain-sts, read again for every exchange. */
    actorTokenFile: string;
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
  const audience = env.OIDC_AUDIENCE ?? 'agentgateway';
  const accepted = list(env.OIDC_ACCEPTED_AUDIENCES);
  const oidc = {
    issuer,
    jwksUrl: devTestIssuer ? `${selfUrl}/dev/issuer/jwks` : (env.OIDC_JWKS_URL ?? ''),
    audience,
    acceptedAudiences: accepted.length ? accepted : [audience],
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

  const metadataUrl = env.DELEGATION_METADATA_URL ?? '';
  const actorTokenFile = env.DELEGATION_ACTOR_TOKEN_FILE ?? '';
  if (!metadataUrl !== !actorTokenFile) {
    // Half a delegation would forward the caller's token where an exchanged one is expected.
    throw new Error('DELEGATION_METADATA_URL and DELEGATION_ACTOR_TOKEN_FILE are set together or not at all.');
  }
  if (metadataUrl && !URL.canParse(metadataUrl)) {
    throw new Error(`DELEGATION_METADATA_URL is not a URL: ${metadataUrl}`);
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
    delegation: metadataUrl ? { metadataUrl, actorTokenFile } : undefined,
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
