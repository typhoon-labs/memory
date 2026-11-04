/**
 * Runtime configuration, fetched from /config.json (served by the container),
 * so one image works in any environment.
 */
export interface RuntimeConfig {
  /** OIDC issuer as the browser sees it (Keycloak realm URL). */
  oidcIssuer: string;
  oidcClientId: string;
  oidcScope: string;
  /** The chat assistant's A2A URL as the browser reaches it (the gateway route). Empty: this origin. */
  a2aUrl: string;
  a2aProtocolVersion: '1.0' | '0.3';
  pollIntervalMs: number;
  /**
   * Sign in with `prompt=login`, so the issuer shows its form every time and
   * each tab can pick its own user. False: an existing session at the issuer
   * is reused. Absent (a server older than 0.1.13): true, as before.
   */
  forceSignIn: boolean;
  appVersion: string;
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  const res = await fetch('/config.json', { cache: 'no-store' });
  if (!res.ok) throw new Error(`/config.json returned HTTP ${res.status}`);
  const raw = (await res.json()) as Partial<RuntimeConfig>;
  if (!raw.oidcIssuer || !raw.oidcClientId) throw new Error('/config.json is missing oidcIssuer or oidcClientId');
  return {
    oidcIssuer: raw.oidcIssuer.replace(/\/+$/, ''),
    oidcClientId: raw.oidcClientId,
    oidcScope: raw.oidcScope || 'openid profile',
    a2aUrl: (raw.a2aUrl || window.location.origin).replace(/\/+$/, ''),
    a2aProtocolVersion: raw.a2aProtocolVersion === '0.3' ? '0.3' : '1.0',
    pollIntervalMs: Number(raw.pollIntervalMs) > 0 ? Number(raw.pollIntervalMs) : 2000,
    forceSignIn: raw.forceSignIn !== false,
    appVersion: raw.appVersion ?? '',
  };
}
