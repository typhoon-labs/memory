import { apiKey } from '@better-auth/api-key';
import { redisStorage } from '@better-auth/redis-storage';
import { account, apikey, session, user } from '@typhoon/db';
import { createAppLogger } from '@typhoon/logger';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins/admin';
import { genericOAuth } from 'better-auth/plugins/generic-oauth';
import { Redis } from 'ioredis';
import { db } from './db.js';

const log = createAppLogger('auth');

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

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
  log.info('OIDC provider configured', { issuer });
  return [
    {
      providerId: 'oidc',
      clientId,
      clientSecret,
      discoveryUrl: `${issuer}/.well-known/openid-configuration`,
      scopes: ['openid', 'email', 'profile'],
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
  secondaryStorage: redisStorage({ client: redis }),
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
    admin({ defaultRole: 'rep', adminRoles: ['admin'] }),
    ...(oidcProviders.length > 0 ? [genericOAuth({ config: oidcProviders })] : []),
  ],
});
