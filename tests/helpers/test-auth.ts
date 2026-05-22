/**
 * Test-only Better Auth instance with `testUtils` plugin.
 *
 * Creates sessions programmatically for E2E tests — replaces the fragile
 * OIDC browser flow for all non-auth tests. Shares the same database and
 * AUTH_SECRET as the running API server so sessions are mutually valid.
 *
 * SECURITY: This file must NEVER be imported from production code (apps/ or packages/).
 * It lives under tests/ and is excluded from production builds.
 */
import { resolve } from 'node:path';

import { account, createConnection, session, user } from '@typhoon/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { testUtils } from 'better-auth/plugins';
import { config } from 'dotenv';
import { eq } from 'drizzle-orm';

config({ path: resolve(process.cwd(), '.env') });

function createTestAuth() {
  const dbUrl = process.env.DATABASE_URL ?? 'postgresql://typhoon:typhoon@localhost:5432/typhoon';
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      'AUTH_SECRET is not set. E2E tests require AUTH_SECRET to match the running API server.\n' +
        'Ensure your .env file is present and contains AUTH_SECRET.',
    );
  }

  const { db, sql } = createConnection(dbUrl);

  const auth = betterAuth({
    basePath: '/v1/auth',
    baseURL: process.env.AUTH_URL ?? 'http://localhost:5172',
    secret,
    database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account } }),
    session: { storeSessionInDatabase: true },
    advanced: { database: { generateId: () => crypto.randomUUID() } },
    plugins: [testUtils()],
  });

  return { auth, db, sql };
}

type TestAuth = ReturnType<typeof createTestAuth>;
type TestContext = Awaited<TestAuth['auth']['$context']>;

let instance: TestAuth | null = null;
let contextPromise: Promise<TestContext> | null = null;

function getInstance() {
  if (!instance) instance = createTestAuth();
  return instance;
}

async function getContext(): Promise<TestContext> {
  if (!contextPromise) contextPromise = getInstance().auth.$context;
  return contextPromise;
}

/** Return signed session cookies for the given user (Playwright-compatible). */
export async function getTestCookies(opts: { userId: string; domain?: string }) {
  const ctx = await getContext();
  return ctx.test.getCookies(opts);
}

/** Look up a user's ID by email. Throws if the user doesn't exist. */
export async function resolveUserByEmail(email: string): Promise<string> {
  const { db } = getInstance();
  const [found] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!found) {
    throw new Error(`User not found: ${email}. Ensure the database is seeded (bun run seed).`);
  }
  return found.id;
}

/** Close the test database connection pool. Call in global teardown. */
export async function teardownTestAuth(): Promise<void> {
  contextPromise = null;
  if (instance) {
    await instance.sql.end();
    instance = null;
  }
}
