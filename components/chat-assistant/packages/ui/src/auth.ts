/**
 * Sign-in with OpenID Connect: authorization code with PKCE (S256), public
 * client `chat-ui`. oidc-client-ts does the protocol work.
 *
 * The session lives in sessionStorage, which is per tab, so three tabs can be
 * signed in as three roles side by side.
 */
import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import type { RuntimeConfig } from './config';

export interface Viewer {
  user: string;
  roles: string[];
  team: string;
}

/**
 * Reads the display claims from the access token. This is for showing who is
 * signed in; it decides nothing. The server verifies the token on every request.
 */
export function viewerFrom(accessToken: string): Viewer {
  try {
    const payload = accessToken.split('.')[1] ?? '';
    const json = decodeURIComponent(
      atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join(''),
    );
    const claims = JSON.parse(json) as { preferred_username?: string; sub?: string; roles?: unknown; team?: unknown };
    return {
      user: claims.preferred_username ?? claims.sub ?? 'unknown',
      roles: Array.isArray(claims.roles) ? claims.roles.filter((r): r is string => typeof r === 'string') : [],
      team: typeof claims.team === 'string' ? claims.team : '',
    };
  } catch {
    return { user: 'unknown', roles: [], team: '' };
  }
}

export interface Auth {
  manager: UserManager;
  /** The signed-in user after start-up (and after a redirect back from the issuer), or null. */
  user: User | null;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
}

let starting: Promise<Auth> | undefined;

/** Idempotent: React may run effects twice in development, the code exchange must happen once. */
export function startAuth(config: RuntimeConfig): Promise<Auth> {
  starting ??= (async () => {
    const here = `${window.location.origin}/`;
    const manager = new UserManager({
      authority: config.oidcIssuer,
      client_id: config.oidcClientId,
      redirect_uri: here,
      post_logout_redirect_uri: here,
      response_type: 'code',
      scope: config.oidcScope,
      loadUserInfo: false,
      automaticSilentRenew: true,
      userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    });

    let user: User | null = null;
    const params = new URLSearchParams(window.location.search);
    if (params.has('code') && params.has('state')) {
      user = await manager.signinRedirectCallback();
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      user = await manager.getUser();
      if (user?.expired) {
        await manager.removeUser();
        user = null;
      }
    }

    return {
      manager,
      user,
      // prompt=login: always show the sign-in form, so each tab can pick its own user.
      signIn: () => manager.signinRedirect({ prompt: 'login' }),
      signOut: async () => {
        try {
          await manager.signoutRedirect();
        } catch {
          await manager.removeUser();
          window.location.assign(here);
        }
      },
    };
  })();
  return starting;
}
