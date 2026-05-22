/**
 * Shared E2E test utilities.
 *
 * Usage:
 *   import { DESK_URL, ADMIN_URL, injectTestSession } from '../helpers/e2e-utils';
 *   import { oidcLogin } from '../helpers/e2e-utils'; // only for auth.e2e.ts
 */
import type { Browser, BrowserContext, Page } from 'playwright';

import { getTestCookies, resolveUserByEmail } from './test-auth';

/** Desk app base URL — override via DESK_URL env var. */
export const DESK_URL = process.env.DESK_URL ?? 'http://localhost:5173';

/** Admin app base URL — override via ADMIN_URL env var. */
export const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:5174';

/**
 * Create an authenticated browser session using Better Auth test utils.
 *
 * Looks up the user by email in the database, creates a real session, and
 * injects the signed session cookie into a new Playwright browser context.
 * No OIDC/Dex dependency — sessions go directly into the same Postgres the
 * running API server reads from.
 */
export async function injectTestSession(
  browser: Browser,
  email: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const userId = await resolveUserByEmail(email);
  const cookies = await getTestCookies({ userId, domain: 'localhost' });

  const context = await browser.newContext();
  await context.addCookies(cookies);
  const page = await context.newPage();

  return { context, page };
}

/**
 * Perform OIDC login via Dex (browser-based).
 *
 * Retained for auth.e2e.ts which specifically validates the OIDC flow.
 * All other E2E tests should use `injectTestSession` instead.
 */
export async function oidcLogin(page: Page, email: string, password: string, returnUrl: string): Promise<void> {
  await page.click('button:has-text("Sign in with SSO")');
  await page.waitForURL('**/dex/**', { timeout: 10_000 });
  await page.fill('input[id="login"]', email);
  await page.fill('input[id="password"]', password);
  await page.click('button[type="submit"]:has-text("Login")');
  await page.waitForURL(`${returnUrl}/**`, { timeout: 15_000 });
}
