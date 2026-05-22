import { apiKey } from '@better-auth/api-key';
import { redisStorage } from '@better-auth/redis-storage';
import { APP_ROLES } from '@typhoon/config';
import { account, apikey, session, user } from '@typhoon/db';
import { createAppLogger } from '@typhoon/logger';
import { RedisProvider } from '@typhoon/queue';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';

import { db } from './db';

const log = createAppLogger('auth');

const redisProvider = new RedisProvider();
// redisStorage only uses get/set/setex/del/keys — available on both Redis and Cluster
const redis = redisProvider.createClient() as Parameters<typeof redisStorage>[0]['client'];

const oidcProviders: Parameters<typeof genericOAuth>[0]['config'] = (() => {
  const issuer = process.env.OIDC_ISSUER_URL;
  if (!issuer) {
    log.debug('No OIDC provider configured');
    return [];
  }
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('OIDC_ISSUER_URL is set but OIDC_CLIENT_ID or OIDC_CLIENT_SECRET is missing');
  }
  // Front-channel URL (browser → IdP); back-channel is the server's direct route
  // to the IdP, which differs in dev when the IdP lives on the host and the
  // server runs in a docker network. In prod both are the same public URL.
  const backchannel = process.env.OIDC_BACKCHANNEL_URL ?? issuer;
  log.info('OIDC provider configured', { issuer, backchannel });
  return [
    {
      providerId: 'oidc',
      clientId,
      clientSecret,
      authorizationUrl: `${issuer}/auth`,
      tokenUrl: `${backchannel}/token`,
      userInfoUrl: `${backchannel}/userinfo`,
      issuer,
      scopes: ['openid', 'email', 'profile', 'groups'],
      mapProfileToUser: (profile): Record<string, unknown> => {
        const groups: string[] = profile.groups ?? [];
        const roleMap: [string, string[]][] = [
          [APP_ROLES.ADMIN, (process.env.ADMIN_ROLES ?? 'admin').split(',').map((r) => r.trim())],
          [APP_ROLES.REP, (process.env.REP_ROLES ?? 'rep').split(',').map((r) => r.trim())],
        ];
        for (const [role, idpGroups] of roleMap) {
          if (groups.some((g) => idpGroups.includes(g))) {
            return { role };
          }
        }
        return {};
      },
    },
  ];
})();

export const auth = betterAuth({
  basePath: '/v1/auth',
  baseURL: process.env.AUTH_URL ?? 'http://localhost:5172',
  secret: process.env.AUTH_SECRET,
  trustedOrigins: (process.env.TRUSTED_ORIGINS ?? 'http://localhost:5173,http://localhost:5174')
    .split(',')
    .map((o) => o.trim()),
  database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, apikey } }),
  secondaryStorage: redisStorage({ client: redis, keyPrefix: 'auth:' }),
  session: {
    storeSessionInDatabase: true,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
  plugins: [
    apiKey(),
    admin({ defaultRole: APP_ROLES.REP, adminRoles: [APP_ROLES.ADMIN] }),
    ...(oidcProviders.length > 0 ? [genericOAuth({ config: oidcProviders })] : []),
  ],
});
